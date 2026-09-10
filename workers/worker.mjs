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
const EXS = ['EX1','EX2','EX3','EX4','EX5','EX6','EX7','EX8','EX9','Apex'];
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
  return {
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
async function publishToGitHub(sub, env) {
  const path = 'js/data.js';
  const meta = await ghGet(path, env);
  let text;
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
    arr.push(rec);
    text = meta.text.slice(0, start) + JSON.stringify(arr, null, 2) + meta.text.slice(end + 1);
  } else {
    // 文件不存在：建一个基础文件
    const head = '/* MHRS 成绩数据 */\nwindow.MHRS_RECORDS = [\n];\n';
    text = head;
  }
  const sha = await ghPut(path, meta ? meta.sha : null, text, '审核通过：投稿发布 ' + new Date().toISOString().slice(0, 10), env);
  // 自动刷新资源版本号，避免缓存
  try {
    const idx = await ghGet('index.html', env);
    if (idx) {
      const stamp = 'v=' + Date.now();
      const next = idx.text.replace(/\?v=\d+/g, '?' + stamp);
      if (next !== idx.text) await ghPut('index.html', idx.sha, next, '自动刷新资源版本号', env);
    }
  } catch (e) { /* 不阻塞 */ }
  return sha;
}
async function handleApprove(request, env, cors) {
  const b = await readBody(request);
  if (!adminOk(request, env)) return json({ ok: false, error: '无权限' }, 401, cors);
  const id = cleanStr(b.id, 200);
  if (!id) return json({ ok: false, error: '缺少草稿 id' }, 400, cors);
  const raw = await env.SUBMISSIONS.get(id).catch(() => null);
  if (!raw) return json({ ok: false, error: '草稿不存在或已被处理' }, 404, cors);
  const sub = JSON.parse(raw);
  const sha = await publishToGitHub(sub, env);
  await env.SUBMISSIONS.delete(id).catch(() => {});
  return json({ ok: true, sha }, 200, cors);
}
async function handleReject(request, env, cors) {
  const b = await readBody(request);
  if (!adminOk(request, env)) return json({ ok: false, error: '无权限' }, 401, cors);
  const id = cleanStr(b.id, 200);
  await env.SUBMISSIONS.delete(id).catch(() => {});
  return json({ ok: true }, 200, cors);
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
