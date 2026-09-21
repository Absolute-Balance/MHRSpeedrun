/* ============================================================
 * MHRS 投稿审核 Worker（Cloudflare Workers，免费额度）
 *
 * 接口：
 *   POST /submit   公开投稿（任何人） → 存入草稿区 KV
 *   GET  /pending  审核列表（需 ADMIN_KEY）
 *   POST /approve  审核通过：合并进 GitHub js/data.js（需 ADMIN_KEY）
 *   POST /reject   驳回删除草稿（需 ADMIN_KEY）
 *
 * 环境变量（Workers → Settings → Variables）：
 *   ADMIN_KEY      审核口令（你自己生成的一长串随机字符）
 *   GITHUB_TOKEN   GitHub 细粒度令牌（本仓库 Contents 读写；存服务器，不进浏览器）
 *   GITHUB_OWNER   Absolute-Balance
 *   GITHUB_REPO    MHRSpeedrun
 *   GITHUB_BRANCH  main
 *   ALLOWED_ORIGIN 逗号分隔的允许来源，如 https://absolute-balance.github.io,http://127.0.0.1:8123
 *
 * KV 绑定（Workers → Settings → KV）：命名空间名字 SUBMISSIONS
 * 草稿 key：draft:{时间戳}:{随机}  value：投稿 JSON
 * ============================================================ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const reqOrigin = request.headers.get('Origin') || '';
    const corsHeaders = corsFor(env, reqOrigin);

    if (reqOrigin && !isAllowed(reqOrigin, env)) {
      return json({ ok: false, error: '来源不被允许' }, 403, corsHeaders);
    }
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const p = url.pathname.replace(/\/+$/, '');
      if (method === 'POST' && p === '/submit') {
        return await handleSubmit(request, env, corsHeaders);
      }
      if (method === 'GET' && p === '/pending') {
        return await handlePending(request, env, corsHeaders);
      }
      if (method === 'POST' && p === '/approve') {
        return await handleApprove(request, env, corsHeaders);
      }
      if (method === 'POST' && p === '/admin-save') {
        return await handleAdminSave(request, env, corsHeaders);
      }
      if (method === 'POST' && p === '/reject') {
        return await handleReject(request, env, corsHeaders);
      }
      if (method === 'GET' && p === '/testgh') {
        return await handleTestGh(request, env, corsHeaders);
      }
      return json({ ok: false, error: '接口不存在' }, 404, corsHeaders);
    } catch (e) {
      return json({ ok: false, error: '服务器错误：' + e.message }, 500, corsHeaders);
    }
  }
};

/* ---------------- 基础工具 ---------------- */
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers)
  });
}
/* 回显“被允许的请求来源”，支持多个来源（本地调试 + 线上并存） */
function corsFor(env, reqOrigin) {
  const allow = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  let acao = '*';
  if (allow.length) {
    acao = (reqOrigin && allow.indexOf(reqOrigin) >= 0) ? reqOrigin : allow[0];
  }
  return {
    'Access-Control-Allow-Origin': acao,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
    'Access-Control-Max-Age': '86400'
  };
}
function isAllowed(origin, env) {
  const allow = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allow.length) return true;
  return allow.indexOf(origin) >= 0;
}
async function readBody(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) throw new Error('请使用 JSON');
  return await request.json();
}
function adminOk(request, env) {
  const key = request.headers.get('x-admin-key') || '';
  return env.ADMIN_KEY && key === env.ADMIN_KEY;
}
function b64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
function deb64(text) {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function cleanStr(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}
function biliUrl(v) {
  v = cleanStr(v, 300);
  if (!v) return '';
  const m = v.match(/(BV[0-9A-Za-z]{8,})/);
  if (m) return 'https://www.bilibili.com/video/' + m[1];
  const s = v.replace(/^https?:\/\//, '');
  if (s.indexOf('bilibili.com/') === 0 || s.indexOf('www.bilibili.com/') === 0 || s.indexOf('b23.tv/') === 0) {
    return 'https://' + s;
  }
  return null; // 非法
}

/* ---------------- 校验投稿 ---------------- */
const QT = ['raging', 'anomaly300', 'special'];
const EXS = ['EX1','EX2','EX3','EX4','EX5','EX6','EX7','EX8','EX9'];
const RULES = ['sanyou', 'ta'];
const PLATS = ['steam', 'switch', 'ps', 'ps5', 'xbox'];
function validateSubmission(b) {
  if (!b || typeof b !== 'object') throw new Error('内容为空');
  if (cleanStr(b.website, 50)) throw new Error('机器人检测'); // 蜜罐字段
  if (!QT.includes(b.questType)) throw new Error('任务类型不正确');
  if (b.questType === 'raging') {
    if (!/^q\d{2}$/.test(cleanStr(b.quest, 10))) throw new Error('烈祸任务不正确');
  } else {
    if (!EXS.includes(cleanStr(b.exStar, 10))) throw new Error('EX 星级不正确');
  }
  if (!RULES.includes(b.rule)) throw new Error('规则不正确');
  if (!/^m\d{2}$/.test(cleanStr(b.monsterId, 10))) throw new Error('怪物不正确');
  if (!/^[a-z]+$/.test(cleanStr(b.weaponId, 20))) throw new Error('武器不正确');
  const timeMs = Number(b.timeMs);
  if (!(timeMs > 0 && timeMs < 3600000)) throw new Error('用时不正确');
  const author = cleanStr(b.author, 60);
  if (!author) throw new Error('请填写玩家名');
  const date = cleanStr(b.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期不正确');
  const vUrl = b.bv ? biliUrl(b.bv) : '';
  if (b.bv && !vUrl) throw new Error('视频仅支持 B 站链接或 BV 号');
  if (!PLATS.includes(b.platform)) b.platform = 'steam';
  if (b.platform === 'ps5') b.platform = 'ps'; // 兼容旧值
  const rec = {
    questType: b.questType,
    quest: b.questType === 'raging' ? cleanStr(b.quest, 10) : null,
    exStar: b.questType === 'raging' ? null : cleanStr(b.exStar, 10),
    rule: b.rule,
    monsterId: cleanStr(b.monsterId, 10),
    weaponId: cleanStr(b.weaponId, 20),
    timeMs,
    author,
    date,
    videos: vUrl ? [{ site: 'bilibili', url: vUrl, title: cleanStr(b.title || '', 200) }] : [],
    platform: b.platform,
    note: ''
  };
  /* 5猫任务标记（仅怪异探究 Lv300 / 特别探究 有效；烈祸袭来是官方任务） */
  if (b.fiveCat === true || b.fiveCat === 'true' || b.fiveCat === 1) rec.fiveCat = true;
  return rec;
}

/* ---------------- 限频（可按需调整） ----------------
 * RATE_MAX      同一 IP 在窗口内最多可投稿次数；0 = 不限制（默认关闭）
 * RATE_WINDOW_MS 窗口长度（从该 IP 第一次投稿起算）
 * RATE_TTL_SEC   计数在 KV 的留存秒数（需 ≥ 窗口长度即可）
 * 说明：计数键是 rl:{IP}。若在 v2rayN 规则模式下 workers.dev 走了“直连”，
 *       换节点也不会换 IP（见 README/纪要），所以会一直提示频繁。 */
const RATE_MAX = 0;
const RATE_WINDOW_MS = 3600000;
const RATE_TTL_SEC = 7200;
async function rateLimited(env, ip) {
  if (!(RATE_MAX > 0)) return false; // 限频已关闭
  const key = 'rl:' + (ip || 'unknown');
  const raw = await env.SUBMISSIONS.get(key).catch(() => null);
  const now = Date.now();
  let rec = { n: 0, t: now };
  if (raw) { try { rec = JSON.parse(raw); } catch (e) { /* 忽略 */ } }
  if (now - rec.t > RATE_WINDOW_MS) { rec = { n: 0, t: now }; }
  rec.n += 1;
  await env.SUBMISSIONS.put(key, JSON.stringify(rec), { expirationTtl: RATE_TTL_SEC }).catch(() => {});
  return rec.n > RATE_MAX;
}

/* ---------------- 各接口 ---------------- */
async function handleSubmit(request, env, cors) {
  const b = await readBody(request);
  const sub = validateSubmission(b);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (await rateLimited(env, ip)) {
    return json({ ok: false, error: '提交过于频繁，请稍后再试' }, 429, cors);
  }
  const id = 'draft:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
  await env.SUBMISSIONS.put(id, JSON.stringify({
    ...sub,
    createdAt: new Date().toISOString(),
    submitterIp: ip
  }));
  return json({ ok: true, id }, 200, cors);
}
async function handlePending(request, env, cors) {
  if (!adminOk(request, env)) return json({ ok: false, error: '无权限' }, 401, cors);
  const listResp = await env.SUBMISSIONS.list({ prefix: 'draft:' });
  const items = [];
  for (const k of listResp.keys) {
    const raw = await env.SUBMISSIONS.get(k.name).catch(() => null);
    if (!raw) continue;
    try {
      const sub = JSON.parse(raw);
      items.push(Object.assign({ id: k.name, createdAt: sub.createdAt }, sub));
    } catch (e) { /* 跳过坏数据 */ }
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  /* 标注“换源更新”：同一位置（同题材+同规则）+ 同一个 BV，且新成绩更快 → 通过后会自动替换旧记录 */
  try {
    const meta = await ghGet('js/data.js', env);
    if (meta) {
      const s = meta.text.indexOf('['), e = meta.text.lastIndexOf(']');
      const arr = JSON.parse(meta.text.slice(s, e + 1));
      items.forEach(it => {
        const bv = bvOf((it.videos && it.videos[0] && it.videos[0].url) || '');
        if (!bv) return;
        const olds = arr.filter(x => sameCell(x, it) && (x.videos || []).some(v => bvOf(v.url) === bv));
        const slower = olds.filter(x => Number(it.timeMs) < Number(x.timeMs));
        if (slower.length && slower.length === olds.length) {
          it.replaceInfo = { oldTime: fmtMs(slower[0].timeMs), oldAuthor: slower[0].author || '' };
        }
      });
    }
  } catch (e) { /* 标注失败不影响审核列表 */ }
  return json({ ok: true, list: items }, 200, cors);
}

/* GitHub 写入（含自动刷新版本号） */
const GH_API = (owner, repo) => 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/';
async function ghGet(path, env) {
  const r = await fetch(GH_API(env.GITHUB_OWNER, env.GITHUB_REPO) + path + '?ref=' + env.GITHUB_BRANCH, {
    headers: {
      'User-Agent': 'mhrs-worker',
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + env.GITHUB_TOKEN
    }
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('读取 GitHub 失败 HTTP ' + r.status);
  const j = await r.json();
  return { sha: j.sha, text: deb64(j.content) };
}
async function ghPut(path, sha, content, message, env) {
  const r = await fetch(GH_API(env.GITHUB_OWNER, env.GITHUB_REPO) + path, {
    method: 'PUT',
    headers: {
      'User-Agent': 'mhrs-worker',
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, content: b64(content), sha, branch: env.GITHUB_BRANCH })
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e.message || '') + '（HTTP ' + r.status + '）');
  }
  const j = await r.json();
  return j.commit ? j.commit.sha : '';
}
/* 查重键：时间/题材/怪物/武器/规则/作者/日期 全部相同即视为重复 */
function recDupKey(r) {
  return [r.questType, r.quest || '', r.exStar || '', r.monsterId, r.weaponId, r.rule,
    r.timeMs, String(r.author == null ? '' : r.author).trim(), r.date].join('|');
}
/* 视频 BV 号 */
function bvOf(url) {
  const m = String(url || '').match(/(BV[0-9A-Za-z]{8,})/);
  return m ? m[1] : '';
}
/* 同一位置（任务类型+任务/EX+怪物+武器） */
function sameCell(a, b) {
  return a.questType === b.questType &&
    (a.quest || '') === (b.quest || '') &&
    (a.exStar || '') === (b.exStar || '') &&
    a.monsterId === b.monsterId &&
    a.weaponId === b.weaponId;
}
/* 毫秒 → 05'02''52 */
function fmtMs(ms) {
  const cs = Math.floor(Number(ms) / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return String(m).padStart(2, '0') + "'" + String(s).padStart(2, '0') + "''" + String(c).padStart(2, '0');
}
async function publishToGitHub(sub, env) {
  const path = 'js/data.js';
  const meta = await ghGet(path, env);
  let text;
  let replaceCount = 0;
  if (meta) {
    const start = meta.text.indexOf('[');
    const end = meta.text.lastIndexOf(']');
    if (start < 0 || end < 0) throw new Error('data.js 结构异常');
    const arr = JSON.parse(meta.text.slice(start, end + 1));
    const rec = Object.assign({}, sub);
    delete rec.createdAt;
    delete rec.submitterIp;
    delete rec.id;
    rec.id = 's' + Date.now().toString(36);
    /* 重复检测：正式数据中已有完全相同的成绩则拒绝发布 */
    if (arr.some(x => recDupKey(x) === recDupKey(rec))) {
      throw new Error('重复投稿：该成绩已存在于正式数据（时间 / 题材 / 怪物 / 武器 / 规则 / 作者 / 日期完全相同），已阻止发布');
    }
    /* 换源更新：同一位置（同题材+同规则）+ 同一个视频（BV）
       → 新成绩更快则删除旧记录并写入新记录（同一 commit）；不快则拒绝 */
    const newBv = bvOf((rec.videos && rec.videos[0] && rec.videos[0].url) || '');
    let replaced = 0;
    if (newBv) {
      const olds = arr.filter(x => sameCell(x, rec) && (x.videos || []).some(v => bvOf(v.url) === newBv));
      if (olds.length) {
        const notFaster = olds.filter(x => !(Number(rec.timeMs) < Number(x.timeMs)));
        if (notFaster.length) {
          throw new Error('该位置（同题材 · 同规则）已有更快或相同的成绩（旧成绩 ' +
            fmtMs(notFaster[0].timeMs) + '），已阻止发布');
        }
        for (let i = arr.length - 1; i >= 0; i--) {
          if (olds.indexOf(arr[i]) >= 0) { arr.splice(i, 1); replaced++; }
        }
      }
    }
    arr.push(rec);
    text = meta.text.slice(0, start) + JSON.stringify(arr, null, 2) + meta.text.slice(end + 1);
    replaceCount = replaced;
  } else {
    // 文件不存在：建一个基础文件
    const head = '/* MHRS 成绩数据 */\nwindow.MHRS_RECORDS = [\n];\n';
    text = head;
  }
  const sha = await ghPut(path, meta ? meta.sha : null, text,
    (replaceCount ? '审核通过：换源替换旧成绩 ' : '审核通过：投稿发布 ') + new Date().toISOString().slice(0, 10), env);
  // 自动刷新资源版本号，避免缓存
  try {
    const idx = await ghGet('index.html', env);
    if (idx) {
      const stamp = 'v=' + Date.now();
      const next = idx.text.replace(/\?v=\d+/g, '?' + stamp);
      if (next !== idx.text) await ghPut('index.html', idx.sha, next, '自动刷新资源版本号', env);
    }
  } catch (e) { /* 不阻塞 */ }
  return { sha, replaced: replaceCount };
}
async function handleApprove(request, env, cors) {
  const b = await readBody(request);
  if (!adminOk(request, env)) return json({ ok: false, error: '无权限' }, 401, cors);
  const id = cleanStr(b.id, 200);
  if (!id) return json({ ok: false, error: '缺少草稿 id' }, 400, cors);
  const raw = await env.SUBMISSIONS.get(id).catch(() => null);
  if (!raw) return json({ ok: false, error: '草稿不存在或已被处理' }, 404, cors);
  const sub = JSON.parse(raw);
  const r = await publishToGitHub(sub, env);
  await env.SUBMISSIONS.delete(id).catch(() => {});
  return json({ ok: true, sha: r.sha, replaced: r.replaced }, 200, cors);
}
async function handleReject(request, env, cors) {
  const b = await readBody(request);
  if (!adminOk(request, env)) return json({ ok: false, error: '无权限' }, 401, cors);
  const id = cleanStr(b.id, 200);
  await env.SUBMISSIONS.delete(id).catch(() => {});
  return json({ ok: true }, 200, cors);
}

/* ---------------- 管理员直录（服务器通道：串行 + 自动重试） ----------------
 * 请求：POST /admin-save  { ops: [ {type:'add'|'update', rec:{...}} | {type:'delete', id} ] }
 * 鉴权：x-admin-key（与审核口令相同）
 * 优点：所有 GitHub 请求在服务端串行执行，遇到 403 限流/409 冲突自动等待重试 */
async function ghWithRetry(fn, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || '');
      const retryable = /HTTP (403|409|429)/.test(msg) || /rate limit|secondary|conflict|sha|fetch|network/i.test(msg);
      if (!retryable || i === tries - 1) throw e;
      await new Promise(r => setTimeout(r, 1200 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}
async function adminApplyOnce(ops, env) {
  const meta = await ghGet('js/data.js', env);
  if (!meta) throw new Error('data.js 不存在');
  const start = meta.text.indexOf('['), end = meta.text.lastIndexOf(']');
  if (start < 0 || end < 0) throw new Error('data.js 结构异常');
  const arr = JSON.parse(meta.text.slice(start, end + 1));
  let added = 0, updated = 0, deleted = 0;
  for (const op of ops) {
    if (op.type === 'add' || op.type === 'update') {
      const src = Object.assign({}, op.rec || {});
      if (!src.bv && src.videos && src.videos[0] && src.videos[0].url) {
        src.bv = src.videos[0].url;
        if (!src.title) src.title = src.videos[0].title || '';
      }
      const rec = validateSubmission(src);
      rec.id = cleanStr((op.rec && op.rec.id) || '', 40) || ('r' + Date.now().toString(36));
      const i = arr.findIndex(x => x.id === rec.id);
      if (i >= 0) { arr[i] = rec; updated++; } else { arr.push(rec); added++; }
    } else if (op.type === 'delete') {
      const id = cleanStr(op.id, 40);
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].id === id) { arr.splice(i, 1); deleted++; }
      }
    }
  }
  if (!added && !updated && !deleted) return { sha: '', applied: { added, updated, deleted }, noop: true };
  const text = meta.text.slice(0, start) + JSON.stringify(arr, null, 2) + meta.text.slice(end + 1);
  const message = '网页录入：新增' + added + ' 修改' + updated + ' 删除' + deleted + ' ' + new Date().toISOString().slice(0, 10);
  const sha = await ghPut('js/data.js', meta.sha, text, message, env);
  /* 刷新资源版本号（失败不阻塞；串行 await，避免并发写触发限流） */
  try {
    const idx = await ghGet('index.html', env);
    if (idx) {
      const stamp = 'v=' + Date.now();
      const next = idx.text.replace(/\?v=\d+/g, '?' + stamp);
      if (next !== idx.text) await ghPut('index.html', idx.sha, next, '自动刷新资源版本号', env);
    }
  } catch (e) { /* 不阻塞 */ }
  return { sha, applied: { added, updated, deleted } };
}
async function handleAdminSave(request, env, cors) {
  if (!adminOk(request, env)) return json({ ok: false, error: '无权限：审核口令不正确' }, 401, cors);
  let b;
  try { b = await readBody(request); }
  catch (e) { return json({ ok: false, error: e.message }, 400, cors); }
  const ops = Array.isArray(b && b.ops) ? b.ops.filter(x => x && typeof x === 'object') : [];
  if (!ops.length) return json({ ok: false, error: '没有要保存的改动' }, 400, cors);
  if (ops.length > 100) return json({ ok: false, error: '一次最多 100 条改动' }, 400, cors);
  try {
    const r = await ghWithRetry(() => adminApplyOnce(ops, env), 4);
    if (r.noop) return json({ ok: false, error: '没有实际改动' }, 400, cors);
    return json({ ok: true, sha: r.sha, applied: r.applied }, 200, cors);
  } catch (e) {
    return json({ ok: false, error: '保存失败：' + e.message }, 500, cors);
  }
}
/* 诊断：用 Worker 里的 GITHUB_TOKEN 试读仓库文件，返回 GitHub 原始报错 */
async function handleTestGh(request, env, cors) {
  const q = new URL(request.url).searchParams;
  const key = request.headers.get('x-admin-key') || q.get('key') || '';
  if (!(env.ADMIN_KEY && key === env.ADMIN_KEY)) return json({ ok: false, error: '无权限' }, 401, cors);
  const out = {
    owner: env.GITHUB_OWNER || '(空)',
    repo: env.GITHUB_REPO || '(空)',
    branch: env.GITHUB_BRANCH || '(空)',
    tokenSet: !!(env.GITHUB_TOKEN && env.GITHUB_TOKEN.length > 10),
    tokenTail: env.GITHUB_TOKEN ? env.GITHUB_TOKEN.slice(-4) : '',
    kvSet: !!(env.SUBMISSIONS)
  };
  try {
    const r = await fetch(GH_API(env.GITHUB_OWNER || '', env.GITHUB_REPO || '') + 'js/data.js?ref=' + (env.GITHUB_BRANCH || 'main'), {
      headers: { 'User-Agent': 'mhrs-worker', Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + (env.GITHUB_TOKEN || '') }
    });
    out.httpStatus = r.status;
    const t = await r.text();
    try { out.github = JSON.parse(t); } catch (e2) { out.github = t.slice(0, 300); }
  } catch (e) {
    out.networkError = e.message;
  }
  return json({ ok: true, diag: out }, 200, cors);
}
