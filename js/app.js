/* ============================================================
 * app.js v3 — 成绩矩阵（单格=最新最快）+ 怪物全武器页 + 单武器页
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.MHRS_CONFIG;
  var MONSTERS = window.MHRS_MONSTERS;
  var RECORDS = window.MHRS_RECORDS;

  var mById = {}, wById = {}, qById = {};
  MONSTERS.forEach(function (m) { mById[m.id] = m; });
  CFG.weapons.forEach(function (w) { wById[w.id] = w; });
  CFG.ragingQuests.forEach(function (q) { qById[q.id] = q; });

  var MONSTER_ICON = CFG.monsterIconDir + '/';
  var WEAPON_ICON = CFG.weaponIconDir + '/';
  var PAGE_SIZE = CFG.axisPageSize || 10;

  var state = {
    questType: 'raging',
    exSel: new Set(),
    rule: 'all',
    page: 1,
    view: 'matrix',              // matrix | monster | weapon | player
    scope: { mid: null, wid: null, quest: null, player: null }
  };
  var expandedIds = new Set();

  /* ================= 工具 ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* 显示统一为 分'秒''百分秒，如 05'02''52 */
  function fmtTime(ms) {
    if (!(ms >= 0)) return "--'--''--";
    var cs = Math.floor(ms / 10);
    var m = Math.floor(cs / 6000);
    var s = Math.floor((cs % 6000) / 100);
    var c = cs % 100;
    return String(m).padStart(2, '0') + "'" + String(s).padStart(2, '0') + "''" + String(c).padStart(2, '0');
  }
  /* 宽松时间解析：5:47.33 / 5'47''33 / 4'58"08 / 5分47秒33 等。
   * 关键：保留原始数字串判断位数（08=百分秒80ms，不能转成8按十分位算）。
   * 未写百分秒/毫秒的（如 3'40、47）按收录规则以 99 替代。 */
  function parseTime(str) {
    var t = String(str).trim().replace(/分/g, ':').replace(/秒/g, '');
    if (!t) return null;
    var parts = t.split(/[^0-9]+/).filter(Boolean);   // 原始数字串，保留前导零
    if (!parts.length) return null;
    var nums = parts.map(Number);
    var sepChars = t.replace(/[0-9]+/g, '').replace(/\s+/g, '');
    var firstSep = sepChars.charAt(0);
    var isMinSep = firstSep === ':' || firstSep === "'" || firstSep === '′' || firstSep === '‘' || firstSep === '"' || firstSep === '”';
    var fracMs = function (raw) {
      if (raw.length >= 3) return +raw;        // 三位=毫秒
      if (raw.length === 2) return (+raw) * 10; // 两位=百分秒（08 → 80ms）
      return (+raw) * 100;                     // 一位=十分之一秒
    };
    if (parts.length >= 3) {
      return (nums[0] * 60 + nums[1]) * 1000 + fracMs(parts[2]);
    }
    if (parts.length === 2) {
      if (isMinSep) return (nums[0] * 60 + nums[1]) * 1000 + 990;  // 分:秒（无百分秒 → 默认99）
      return nums[0] * 1000 + fracMs(parts[1]);                     // 秒.百分
    }
    return nums[0] * 1000 + 990;               // 纯秒（无百分秒 → 默认99）
  }
  /* 宽松日期：2026-9-6 / 2026.09.06 / 2026年9月6日 */
  function normDate(v) {
    var m = String(v).trim().match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})日?$/);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function qtObj(id) { return CFG.questTypes.find(function (q) { return q.id === id; }) || null; }
  function qtLabel(id) { var q = qtObj(id); return q ? q.label : '未选择'; }
  /* ================= 主题（白天/夜晚） ================= */
  var THEME_KEY = 'mhrs_theme';
  function isLight() {
    return (document.documentElement.getAttribute('data-theme') || 'dark') === 'light';
  }
  function syncThemeUI() {
    var b = $('themeBtn');
    if (!b) return;
    var light = isLight();
    b.textContent = light ? '☀️' : '🌙';
    b.title = light ? '当前：白天模式，点击切换到夜晚' : '当前：夜晚模式，点击切换到白天';
  }
  function ruleLegendText() {
    return isLight()
      ? '每格只显示最快成绩 · 深色=三无规则 · 金色=TA规则 · 点怪物头像看全武器 · 点成绩格看该武器详情 · 点作者名查看玩家成绩'
      : '每格只显示最快成绩 · 白色=三无规则 · 黄色=TA规则 · 点怪物头像看全武器 · 点成绩格看该武器详情 · 点作者名查看玩家成绩';
  }

  function ruleObj(id) {
    if (id === 'all') return { label: '全部', id: 'all' };
    return CFG.rules.find(function (r) { return r.id === id; }) || { label: id, id: id };
  }
  function ruleLabel(id) { return ruleObj(id).label; }
  function questObj(recOrId) {
    var id = typeof recOrId === 'string' ? recOrId : recOrId.quest;
    return (id && qById[id]) ? qById[id] : null;
  }
  function tierLabel(t) {
    if (!t) return '未分组';
    if (t === 'Apex') return 'Apex（霸主）';
    if (t === 'raging') return '烈祸袭来';
    return t;
  }
  function tmCls(rule) { return rule === 'ta' ? 'tm ta' : rule === 'free' ? 'tm free' : 'tm'; }
  function platformLabel(id) {
    if (!id) return '—';
    var x = CFG.platforms.find(function (p) { return p.id === id; });
    return x ? x.label : id;
  }
  function siteInfo(site) {
    site = String(site || '').toLowerCase();
    if (site === 'bilibili') return { label: 'B站', cls: 'site-bilibili' };
    if (site === 'youtube') return { label: 'YouTube', cls: 'site-youtube' };
    return { label: site || '视频', cls: 'site-other' };
  }
  /* 仅收录 B 站：支持完整链接或只填 BV 号，统一补全 */
  function biliVideo(v) {
    v = String(v || '').trim();
    if (!v) return '';
    var m = v.match(/(BV[0-9A-Za-z]{8,})/);
    if (m) return 'https://www.bilibili.com/video/' + m[1];
    var s = v.replace(/^https?:\/\//, '');
    if (s.indexOf('bilibili.com/') === 0 || s.indexOf('www.bilibili.com/') === 0 || s.indexOf('b23.tv/') === 0) {
      return 'https://' + s;
    }
    return null; // 非 B 站内容
  }
  //提取BV号
  function biliBvid(v) {
    var m = String(v || '').match(/(BV[0-9A-Za-z]{8,})/i);
    return m ? m[1].slice(0, 2).toUpperCase() + m[1].slice(2) : '';
  }
  //将时间戳转换为日期
  function biliDate(ts) {
    var d = new Date(Number(ts) * 1000);
    if (!ts || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  //标题中提取时间
  function biliTitleTime(title) {
    var text = String(title || '');
    var m = text.match(/(?:^|[^0-9])([0-9]{1,3})\s*['′]\s*([0-9]{1,2})\s*(?:''|["″”])\s*([0-9]{1,3})(?![0-9])/);
    if (!m) {
      var cm = text.match(/(?:^|[^0-9])([0-9]{1,3})\s*分\s*([0-9]{1,2})\s*秒\s*([0-9]{1,3})?(?![0-9])/);
      if (!cm) return '';
      m = [cm[0], cm[1], cm[2], cm[3] || '99'];
    }
    var sec = Number(m[2]);
    var fraction = m[3];
    if (sec >= 60 || fraction.length > 3) return '';
    return m[1] + "'" + m[2] + '"' + m[3];
  }
  //标题中提取规则
  function biliTitleRule(title) {
    var text = String(title || '');
    if (/三无|极限炼化|怪异炼成|怪异炼化/.test(text)) {
      return 'sanyou';
    } else if (/(?:^|[^A-Za-z])TA(?:规则)?(?=$|[^A-Za-z])/i.test(text)) {
      return 'ta';
    }
    return '';
  }
  //标题中识别任务类型与二级任务
  function biliTitleExStar(title) {
    var text = String(title || '');
    if (/\bApex\b/i.test(text)) return 'Apex';
    var m = text.match(/(?:^|[^A-Za-z0-9])EX\s*([1-9])(?:\b|$)/i);
    return m ? 'EX' + m[1] : '';
  }
  function biliTitleQuest(title) {
    var text = String(title || '');
    var key = titleKey(text);
    var raging = CFG.ragingQuests.filter(function (q) {
      return key.indexOf(titleKey(q.label)) >= 0 || key.indexOf(titleKey(q.shortLabel)) >= 0;
    }).sort(function (a, b) { return titleKey(b.label).length - titleKey(a.label).length; });
    if (/烈祸/.test(text) || raging.length) {
      return { type: 'raging', task: raging.length ? raging[0].id : '' };
    }
    if (/\bLv\.?\s*300\b/i.test(text) || /怪异探究\s*(?:Lv\.?\s*)?300/i.test(text) || /300\s*(?:级\s*)?怪异探究/i.test(text)) {
      return { type: 'anomaly300', task: biliTitleExStar(text) };
    }
    if (/特别探究/.test(text) || /超特/.test(text)) {
      return { type: 'special', task: biliTitleExStar(text) };
    }
    return { type: '', task: '' };
  }
  function titleKey(v) {
    return String(v || '').replace(/[·・\s]/g, '').toLowerCase();
  }
  //匹配怪物名称
  function biliTitleMonster(title) {
    var text = titleKey(title);
    var hits = [];
    MONSTERS.forEach(function (m) {
      var fullKey = titleKey(m.name);
      var aliases = [m.name];
      var base = m.name.replace(/^(?:怪异克服|霸主[·・]?|原初形态)/, '');
      if (base && base !== m.name) aliases.push(base);
      aliases.forEach(function (alias) {
        var key = titleKey(alias);
        if (key.length < 2) return;
        var index = text.indexOf(key);
        if (index < 0) return;
        hits.push({ id: m.id, key: key, index: index, exact: key === fullKey });
      });
    });
    hits.sort(function (a, b) {
      return (Number(b.exact) - Number(a.exact)) || (b.key.length - a.key.length) || (a.index - b.index);
    });
    return hits.length ? hits[0].id : '';
  }
  //匹配武器
  function biliTitleWeapon(title) {
    var text = titleKey(title);
    var aliases = [
      { id: 'gs', words: ['大剑'] },
      { id: 'ls', words: ['太刀'] },
      { id: 'sns', words: ['单手剑', '片手剑'] },
      { id: 'db', words: ['双剑', '双刀'] },
      { id: 'hammer', words: ['大锤'] },
      { id: 'hh', words: ['狩猎笛', '笛'] },
      { id: 'lance', words: ['长枪'] },
      { id: 'gl', words: ['铳枪'] },
      { id: 'sa', words: ['剑斧', '斩斧'] },
      { id: 'cb', words: ['盾斧'] },
      { id: 'ig', words: ['操虫棍', '虫棍'] },
      { id: 'lbg', words: ['轻弩炮', '轻弩'] },
      { id: 'hbg', words: ['重弩炮', '重弩'] },
      { id: 'bow', words: ['弓箭', '弓'] }
    ];
    var hits = [];
    aliases.forEach(function (item) {
      if (!wById[item.id]) return;
      item.words.forEach(function (word) {
        var key = titleKey(word);
        var index = text.indexOf(key);
        if (index >= 0) hits.push({ id: item.id, length: key.length, index: index });
      });
    });
    hits.sort(function (a, b) { return (b.length - a.length) || (a.index - b.index); });
    return hits.length ? hits[0].id : '';
  }
  function biliInfoFields(data, raw) {
    var title = data && data.title ? data.title : '';
    var quest = biliTitleQuest(title);
    var monsterId = biliTitleMonster(title);
    var monster = monsterId ? mById[monsterId] : null;
    var task = quest.task;
    if ((quest.type === 'anomaly300' || quest.type === 'special') && monster && /^(EX\d|Apex)$/.test(monster.tier)) {
      task = monster.tier;
    }
    return {
      title: title,
      author: data && data.owner && data.owner.name ? data.owner.name : '',
      date: biliDate(data && data.pubdate),
      time: biliTitleTime(title),
      rule: biliTitleRule(title),
      monsterId: monsterId,
      weaponId: biliTitleWeapon(title),
      questType: quest.type,
      task: task,
      bvid: biliBvid(raw)
    };
  }
  //调用b站接口
  function fetchBiliInfo(raw) {
    var bvid = biliBvid(raw);
    if (!bvid) return Promise.reject(new Error('链接中没有找到 BV 号，请粘贴完整视频链接或 BV 号'));
    return new Promise(function (resolve, reject) {
      var cb = '__mhrsBili_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      var script = document.createElement('script');
      var timer = null;
      var finished = false;
      function finish(fn, value) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
        fn(value);
      }
      window[cb] = function (payload) {
        if (!payload || payload.code !== 0 || !payload.data) {
          finish(reject, new Error((payload && payload.message) || 'B站没有返回视频信息'));
          return;
        }
        finish(resolve, payload.data);
      };
      script.onerror = function () { finish(reject, new Error('无法访问 B 站接口')); };
      script.src = 'https://api.bilibili.com/x/web-interface/view?bvid=' + encodeURIComponent(bvid) + '&jsonp=jsonp&callback=' + cb;
      timer = setTimeout(function () { finish(reject, new Error('识别超时，请稍后重试')); }, 12000);
      document.head.appendChild(script);
    });
  }
  async function identifyBiliVideo() {
    var input = $('eVideo');
    var btn = $('eVideoIdentify');
    var msg = $('eMsg');
    var raw = input.value.trim();
    if (!raw) {
      msg.textContent = '请先粘贴 B 站视频链接或 BV 号';
      msg.style.color = 'var(--danger)';
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = '识别中…';
    msg.textContent = '正在读取 B 站视频信息…';
    msg.style.color = 'var(--text-dim)';
    try {
      var data = await fetchBiliInfo(raw);
      if (data.title) $('eTitle').value = data.title;
      if (data.owner && data.owner.name) $('eAuthor').value = data.owner.name;
      var date = biliDate(data.pubdate);
      if (date) $('eDate').value = date;
      var titleTime = biliTitleTime(data.title);
      if (titleTime) $('eTime').value = titleTime;
      var titleRule = biliTitleRule(data.title);
      if (titleRule) {
        var ruleSel = $('eRule');
        if (ruleSel.querySelector('option[value="' + titleRule + '"]')) ruleSel.value = titleRule;
      }
      var bvid = biliBvid(raw);
      if (bvid) $('eVideo').value = 'https://www.bilibili.com/video/' + bvid;
      msg.textContent = '已识别并回填视频标题、UP 主、日期' + (titleTime ? '、用时' : '') + (titleRule ? '、规则' : '');
      msg.style.color = 'var(--good)';
    } catch (e) {
      msg.textContent = '识别失败：' + e.message;
      msg.style.color = 'var(--danger)';
    } finally {
      btn.disabled = false;
      btn.textContent = '识别';
    }
  }
  /* 最新最快：先比时间快，同时间取日期新 */
  function bestOf(list) {
    if (!list || !list.length) return null;
    var best = null;
    list.forEach(function (r) {
      if (!best || r.timeMs < best.timeMs || (r.timeMs === best.timeMs && r.date > best.date)) best = r;
    });
    return best;
  }
  /* 按规则过滤后的可见成绩 */
  function visibleRecords() {
    if (state.rule === 'all') return RECORDS;
    return RECORDS.filter(function (r) { return r.rule === state.rule; });
  }

  /* ================= 轴向 ================= */
  function mByFile(file) { return MONSTERS.find(function (m) { return m.file === file; }) || null; }
  function buildAxis() {
    if (state.questType === 'raging') {
      return CFG.ragingQuests.map(function (q) {
        return { kind: 'raging', key: q.id, quest: q, monster: mByFile(q.monsterFile) };
      }).filter(function (it) { return !!it.monster; });
    }
    if (state.exSel.size === 0) return null;
    return MONSTERS.filter(function (m) {
      return m.tier && state.exSel.has(m.tier);
    }).map(function (m) {
      return { kind: 'ex', key: m.id, monster: m, ex: m.tier };
    });
  }
  function scopeRecords(opt) {
    var o = opt || {};
    return visibleRecords().filter(function (r) {
      if (r.questType !== state.questType) return false;
      if (o.mid && r.monsterId !== o.mid) return false;
      if (o.quest && r.quest !== o.quest) return false;
      if (o.wid && r.weaponId !== o.wid) return false;
      return true;
    });
  }
  function bracketRecords(item, weaponId) {
    return scopeRecords({ mid: item.monster.id, quest: item.kind === 'raging' ? item.quest.id : null, wid: weaponId });
  }

  /* ================= 面板控件 ================= */
  function renderQuestTypeUI() {
    var box = $('questTypeRadios');
    box.innerHTML = '';
    CFG.questTypes.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = o.id;
      b.className = 'radio-pill';
      b.textContent = o.label;
      b.addEventListener('click', function () {
        state.questType = o.id;
        state.page = 1;
        state.view = 'matrix';
        update();
      });
      box.appendChild(b);
    });
  }
  function syncQuestTypeUI() {
    document.querySelectorAll('#questTypeRadios .radio-pill').forEach(function (b) {
      b.classList.toggle('on', state.questType === b.dataset.id);
    });
  }
  function renderExUI() {
    var chips = $('exChips');
    chips.innerHTML = '';
    CFG.exStars.forEach(function (st) {
      var c = document.createElement('button');
      c.type = 'button';
      c.dataset.star = st;
      c.className = 'chip';
      c.textContent = st;
      c.addEventListener('click', function () {
        if (state.exSel.has(st)) state.exSel.delete(st); else state.exSel.add(st);
        state.page = 1;
        update();
      });
      chips.appendChild(c);
    });
    $('exAll').addEventListener('click', function () {
      CFG.exStars.forEach(function (s) { state.exSel.add(s); });
      state.page = 1;
      update();
    });
    $('exNone').addEventListener('click', function () {
      state.exSel.clear();
      state.page = 1;
      update();
    });
  }
  function syncExUI() {
    document.querySelectorAll('#exChips .chip').forEach(function (c) {
      c.classList.toggle('on', state.exSel.has(c.dataset.star));
    });
  }
  function renderCond() {
    $('ragingHint').classList.toggle('hidden', state.questType !== 'raging');
    $('exWrap').classList.toggle('hidden', state.questType === 'raging');
  }
  function renderRuleUI() {
    var box = $('ruleRadios');
    box.innerHTML = '';
    var opts = [{ id: 'all', label: '全部' }].concat(CFG.rules);
    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = o.id;
      b.className = 'radio-pill';
      b.textContent = o.label;
      b.addEventListener('click', function () {
        state.rule = o.id;
        update();
      });
      box.appendChild(b);
    });
  }
  function syncRuleUI() {
    document.querySelectorAll('#ruleRadios .radio-pill').forEach(function (b) {
      b.classList.toggle('on', state.rule === b.dataset.id);
    });
  }

  /* ================= 矩阵 ================= */
  function renderMatrix() {
    var axis = buildAxis();
    var prompt = $('matrixPrompt');
    var box = $('matrixBox');
    var grid = $('matrixGrid');
    var pager = $('pagerWrap');
    showArea('matrix');

    if (!axis) {
      prompt.classList.remove('hidden');
      box.classList.add('hidden');
      pager.classList.add('hidden');
      $('matrixTitle').innerHTML = '';
      $('matrixSub').textContent = '';
      prompt.textContent = '请选择 EX 星级（EX1~EX9 / Apex，可多选），对应怪物将作为横轴展示。';
      return;
    }

    var pages = Math.max(1, Math.ceil(axis.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var slice = axis.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var n = slice.length;

    prompt.classList.add('hidden');
    box.classList.remove('hidden');

    $('matrixTitle').innerHTML = '<b>' + esc(qtLabel(state.questType)) + '</b>' +
      (state.rule !== 'all' ? ' · ' + esc(ruleLabel(state.rule)) : '');
    $('matrixSub').textContent = ruleLegendText();

    pager.classList.toggle('hidden', pages <= 1);
    if (pages > 1) {
      var prev = '<button type="button" class="btn btn-mini pager-btn" data-pg="' + (state.page - 1) + '"' +
        (state.page <= 1 ? ' disabled' : '') + '>‹</button>';
      var next = '<button type="button" class="btn btn-mini pager-btn" data-pg="' + (state.page + 1) + '"' +
        (state.page >= pages ? ' disabled' : '') + '>›</button>';
      pager.innerHTML = prev + '<span class="pager-info"> ' + state.page + ' / ' + pages + ' 页（每页 ' + PAGE_SIZE + ' 个）</span>' + next;
      pager.querySelectorAll('.pager-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          state.page = parseInt(b.dataset.pg, 10);
          renderMatrix();
          persistState();
          if (box) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      });
    }

    var html = '<div class="corner"><span class="wrow">武 器</span></div>';
    slice.forEach(function (it) {
      var m = it.monster;
      var tt = it.kind === 'raging' ? (it.quest.label + '\n目标：' + m.name) : (m.name + '（' + it.ex + '）');
      html += '<div class="mx-head" data-mid="' + m.id + '" data-quest="' +
        (it.kind === 'raging' ? it.quest.id : '') + '" title="' + esc(tt + '\n点击查看全部武器最快') + '">' +
        (it.kind === 'ex' ? '<span class="ex-badge' + (it.ex === 'Apex' ? ' apex' : '') + '">' + it.ex + '</span>' : '') +
        '<img src="' + MONSTER_ICON + encodeURIComponent(m.file) + '" alt="" loading="lazy">' +
        '<span class="mxlabel">' + esc(it.kind === 'raging' ? it.quest.shortLabel : m.name) + '</span>' +
        '</div>';
    });
    CFG.weapons.forEach(function (w) {
      html += '<div class="mx-weapon" title="' + esc(w.label) + '"><img src="' + WEAPON_ICON + encodeURIComponent(w.file) + '" alt=""><span class="wname">' + esc(w.label) + '</span></div>';
      slice.forEach(function (it) {
        var recs = bracketRecords(it, w.id);
        if (!recs.length) {
          html += '<div class="mx-cell add" data-mid="' + it.monster.id + '" data-quest="' +
            (it.kind === 'raging' ? it.quest.id : '') + '" data-wid="' + w.id + '" title="该位置暂无成绩，点击录入">＋</div>';
          return;
        }
        var best = bestOf(recs);
        var inner = '<div class="line1"><span class="' + tmCls(best.rule) + '">' + fmtTime(best.timeMs) + '</span></div>';
        inner += '<div class="line2"><span class="mxauthor pa" data-p="' + esc(best.author) + '" title="查看该玩家全部成绩">' + esc(best.author) + '</span></div>';
        html += '<div class="mx-cell" data-mid="' + it.monster.id + '" data-quest="' +
          (it.kind === 'raging' ? it.quest.id : '') + '" data-wid="' + w.id + '">' + inner + '</div>';
      });
    });
    grid.innerHTML = html;
    grid.style.gridTemplateColumns = '58px repeat(' + n + ', minmax(0, 1fr))';

    grid.querySelectorAll('.mx-head').forEach(function (el) {
      el.addEventListener('click', function () {
        openView('monster', { mid: el.dataset.mid, quest: el.dataset.quest || null });
      });
    });
    grid.querySelectorAll('.mx-cell:not(.empty)').forEach(function (el) {
      el.addEventListener('click', function () {
        openView('weapon', { mid: el.dataset.mid, wid: el.dataset.wid, quest: el.dataset.quest || null });
      });
    });
    grid.querySelectorAll('.pa[data-p]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        openPlayer(el.dataset.p);
      });
    });
    grid.querySelectorAll('.mx-cell.add').forEach(function (el) {
      el.addEventListener('click', function () {
        openEntry({ mid: el.dataset.mid, wid: el.dataset.wid, quest: el.dataset.quest || null });
      });
    });
  }

  /* ================= 视图切换 ================= */
  function openView(view, scope) {
    state.prev = state.view;
    state.view = view;
    state.scope = {
      mid: scope.mid || null,
      wid: scope.wid || null,
      quest: scope.quest || null,
      player: state.scope.player || null
    };
    update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function openPlayer(name) {
    if (!name) return;
    state.prev = state.view;
    state.view = 'player';
    state.scope.player = name;
    update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function goBack() {
    var target = 'matrix';
    if (state.view === 'weapon' && state.prev === 'monster' && state.scope.mid) {
      target = 'monster';
    } else if (state.view === 'player') {
      if (state.prev === 'weapon' && state.scope.mid && state.scope.wid) target = 'weapon';
      else if (state.prev === 'monster' && state.scope.mid) target = 'monster';
    }
    state.view = target;
    state.prev = 'matrix';
    if (target === 'matrix') state.scope = { mid: null, wid: null, quest: null, player: null };
    else if (target === 'monster') state.scope.wid = null;
    update();
  }
  function backLabel() {
    return '← 返回';
  }
  function commonHead(m) {
    var tags = '<span class="tag qt-' + esc(state.questType) + '">' + esc(qtLabel(state.questType)) + '</span>';
    if (m.tier) tags += '<span class="tag">' + esc(tierLabel(m.tier)) + '</span>';
    if (state.rule !== 'all') tags += '<span class="tag rule-' + esc(state.rule) + '">' + esc(ruleLabel(state.rule)) + '</span>';
    return '<img class="big-icon" src="' + MONSTER_ICON + encodeURIComponent(m.file) + '" alt="">' +
      '<div class="dtitle"><h2>' + esc(m.name) + '</h2>' +
      '<div class="dmeta">' + esc(tierLabel(m.tier)) + '</div></div>' +
      '<div class="ctx-tags">' + tags + '</div>';
  }
  function questScopeNote() {
    var s = state.scope;
    var parts = [];
    if (s.quest && qById[s.quest]) parts.push(qById[s.quest].label);
    return parts.join('');
  }
  function showArea(kind) {
    $('matrixArea').classList.toggle('hidden', kind !== 'matrix');
    $('detailArea').classList.toggle('hidden', kind === 'matrix');
    if (kind === 'matrix') {
      $('backBtn').classList.add('hidden');
    } else {
      $('backBtn').classList.remove('hidden');
      $('backBtn').textContent = backLabel();
    }
  }
  function bindAuthorClicks(container) {
    if (!container) return;
    container.querySelectorAll('.pa[data-p]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        openPlayer(el.dataset.p);
      });
    });
  }

  /* ================= 怪异探究任务规则（独立页面视图） ================= */
  function openAnomalyRules() {
    var rModal = $('rulesModal');
    if (rModal) rModal.classList.add('hidden');
    var fp = $('filterPanel');
    if (fp) fp.classList.add('hidden');
    $('matrixArea').classList.add('hidden');
    $('detailArea').classList.add('hidden');
    var bb = $('backBtn');
    if (bb) bb.classList.add('hidden');
    var aa = $('anomalyArea');
    if (!aa) return;
    aa.classList.remove('hidden');
    window.scrollTo({ top: 0 });
  }
  function closeAnomalyRules() {
    var aa = $('anomalyArea');
    if (aa) aa.classList.add('hidden');
    var fp = $('filterPanel');
    if (fp) fp.classList.remove('hidden');
    state.view = 'matrix';
    state.prev = 'matrix';
    state.scope = { mid: null, wid: null, quest: null, player: null };
    update();
  }

  /* ================= 快速录入 + 管理（空格子 / 单武器页入口） ================= */
  var entryCtx = null;
  function hasToken() {
    try { return !!localStorage.getItem(TOKEN_KEY); } catch (e) { return false; }
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function openEntry(ctx, editRec) {
    var m = mById[ctx.mid], w = wById[ctx.wid];
    if (!m || !w) return;
    var qt = ctx.questType || state.questType;
    var q = null;
    if (qt === 'raging') {
      q = (ctx.quest && qById[ctx.quest]) ? qById[ctx.quest] :
        CFG.ragingQuests.find(function (x) { return x.monsterFile === m.file; }) || null;
      ctx.quest = q ? q.id : null;
    }
    /* 访客（无 GitHub 令牌）点「＋」：自动转投稿弹窗并预填 任务/怪物/武器；
       管理员直录（有令牌）与「✏️ 修改」仍走下方原入口 */
    if (!editRec && !hasToken() && apiBaseOk() && $('submitModal')) {
      openSubmitPrefill(qt, q, m, w);
      return;
    }
    entryCtx = {
      mode: editRec ? 'edit' : 'add',
      id: editRec ? editRec.id : null,
      mid: ctx.mid,
      wid: ctx.wid,
      quest: ctx.quest || null,
      questType: qt
    };
    var task = qt === 'raging' ? (q ? q.label : '烈祸袭来') : (qtLabel(qt) + (m.tier ? ' · ' + m.tier : ''));
    $('eTask').textContent = task + '　' + m.name + ' × ' + w.label;
    $('eWeapon').textContent = w.label;
    var identifyBtn = $('eVideoIdentify');
    if (identifyBtn) {
      identifyBtn.disabled = false;
      identifyBtn.textContent = '识别';
    }
    $('eAuthor').value = '';
    $('eTime').value = '';
    $('eDate').value = todayStr();
    $('eTitle').value = '';
    $('eVideo').value = '';
    var ruleSel = $('eRule');
    ruleSel.value = '';
    try { $('eToken').value = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { }
    if (editRec) {
      $('entryTitle').textContent = '修改成绩';
      ruleSel.value = editRec.rule || '';
      $('eAuthor').value = editRec.author || '';
      $('eTime').value = fmtTime(editRec.timeMs);
      $('eDate').value = editRec.date || '';
      var ev = editRec.videos && editRec.videos[0];
      if (ev) {
        $('eVideo').value = ev.url || '';
        $('eTitle').value = ev.title || '';
      }
      var ep = $('ePlat');
      if (ep.querySelector('option[value="' + editRec.platform + '"]')) ep.value = editRec.platform;
    } else {
      $('entryTitle').textContent = '录入成绩';
      if (state.rule !== 'all' && ruleSel.querySelector('option[value="' + state.rule + '"]')) {
        ruleSel.value = state.rule;
      }
    }
    $('eMsg').textContent = '';
    if (entryCtx.mode === 'add' && !hasToken() && !apiBaseOk()) {
      $('eMsg').textContent = '提示：投稿后端未启用（部署见 workers/DEPLOY.md），此直录入口需要 GitHub 令牌。';
      $('eMsg').style.color = 'var(--text-dim)';
    }
    $('entryModal').classList.remove('hidden');
    $('eAuthor').focus();
  }
  async function saveEntry() {
    var msg = $('eMsg');
    if (!entryCtx) return;
    var qt = entryCtx.questType;
    var rule = $('eRule').value;
    var author = $('eAuthor').value.trim();
    var timeText = $('eTime').value.trim();
    var dateText = $('eDate').value.trim();
    var video = $('eVideo').value.trim();
    if (!rule) { msg.textContent = '请选择规则'; msg.style.color = 'var(--danger)'; return; }
    if (!author) { msg.textContent = '请填写作者'; msg.style.color = 'var(--danger)'; return; }
    var ms = parseTime(timeText);
    if (ms == null) { msg.textContent = '用时格式不对（如 05\'02\'\'52 或 5:02.52）'; msg.style.color = 'var(--danger)'; return; }
    var date = normDate(dateText);
    if (!date) { msg.textContent = '日期格式不对（如 2026-9-6）'; msg.style.color = 'var(--danger)'; return; }
    if (qt === 'raging' && !entryCtx.quest) {
      msg.textContent = '烈祸袭来需要先确定具体任务（请从对应任务列进入）'; msg.style.color = 'var(--danger)'; return;
    }
    var m = mById[entryCtx.mid];
    var videoUrl = '';
    if (video) {
      videoUrl = biliVideo(video);
      if (!videoUrl) { msg.textContent = '视频仅支持 B 站（完整链接或 BV 号，自动补全）'; msg.style.color = 'var(--danger)'; return; }
    }
    var videoTitle = $('eTitle').value.trim();
    var token = '';
    try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { }
    token = ($('eToken').value || '').trim() || token;
    if (!token) {
      msg.textContent = '还没有 GitHub 令牌：请在上方填入后重试（获取：Settings → Developer settings → Fine-grained tokens，Contents 读写）';
      msg.style.color = 'var(--danger)';
      $('eToken').focus();
      return;
    }
    var baseRec = {
      questType: qt,
      quest: qt === 'raging' ? entryCtx.quest : null,
      exStar: qt === 'raging' ? null : (m && m.tier && /^(EX\d|Apex)$/.test(m.tier) ? m.tier : null),
      rule: rule,
      monsterId: entryCtx.mid,
      weaponId: entryCtx.wid,
      timeMs: ms,
      author: author,
      date: date,
      videos: videoUrl ? [{ site: 'bilibili', url: videoUrl, title: videoTitle }] : [],
      platform: $('ePlat').value || 'steam',
      note: ''
    };
    if (entryCtx.mode === 'edit') baseRec.id = entryCtx.id;
    else baseRec.id = 'r' + Date.now().toString(36);
    msg.textContent = '正在提交到 GitHub…';
    msg.style.color = 'var(--text-dim)';
    try {
      var res = await ghTransform(token, function (base) {
        if (entryCtx.mode === 'edit') {
          var i = base.findIndex(function (x) { return x.id === entryCtx.id; });
          if (i >= 0) base[i] = baseRec;
          else base.push(baseRec);
        } else {
          base.push(baseRec);
        }
      });
      try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { }
      if (applyDataFromText(res.text)) update();
      msg.textContent = (entryCtx.mode === 'edit' ? '已修改' : '已录入') + '并保存 commit ' + res.sha.slice(0, 7) + '，本页已即时更新；线上约 1~2 分钟后刷新可见';
      msg.style.color = 'var(--good)';
      entryCtx = null;
    } catch (e) {
      msg.textContent = '保存失败：' + e.message;
      msg.style.color = 'var(--danger)';
    }
  }

  /* ---- 管理操作（仅令牌持有者可见） ---- */
  function admHtml(recId) {
    if (!hasToken()) return '';
    return '<div class="adm-bar">' +
      '<button type="button" class="btn btn-mini adm-edit" data-id="' + esc(recId) + '">✏️ 修改</button>' +
      '<button type="button" class="btn btn-mini adm-del" data-id="' + esc(recId) + '">🗑 删除</button>' +
      '</div>';
  }
  function bindAdmClicks(container) {
    if (!container) return;
    container.querySelectorAll('.adm-edit').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.id;
        var rec = RECORDS.find(function (r) { return r.id === id; });
        if (!rec) return;
        openEntry({
          mid: rec.monsterId,
          wid: rec.weaponId,
          quest: rec.quest || null,
          questType: rec.questType
        }, rec);
      });
    });
    container.querySelectorAll('.adm-del').forEach(function (b) {
      b.addEventListener('click', function () { deleteRecordId(b.dataset.id); });
    });
  }
  async function deleteRecordId(id) {
    if (!window.confirm('确定删除这条成绩吗？确认后将立即提交到 GitHub（可随时从 git 历史找回）。')) return;
    var token = '';
    try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { }
    if (!token) { window.alert('未找到 GitHub 令牌，无法保存删除。'); return; }
    try {
      var res = await ghTransform(token, function (base) {
        var i = base.findIndex(function (x) { return x.id === id; });
        if (i >= 0) base.splice(i, 1);
      });
      if (applyDataFromText(res.text)) update();
      window.alert('已删除该成绩并保存（commit ' + res.sha.slice(0, 7) + '）');
    } catch (e) {
      window.alert('删除失败：' + e.message);
    }
  }

  /* ================= 玩家页（按日期时间线） ================= */
  function renderPlayerView() {
    var pname = state.scope.player;
    if (!pname) { state.view = 'matrix'; update(); return; }
    showArea('player');

    var all = RECORDS.filter(function (r) { return r.author === pname; })
      .sort(function (a, b) {
        return a.date < b.date ? 1 : a.date > b.date ? -1 : a.timeMs - b.timeMs;
      });
    var wset = new Set();
    all.forEach(function (r) { wset.add(r.weaponId); });

    var tags = '<span class="tag">成绩 ' + all.length + ' 条</span>' +
      '<span class="tag">武器 ' + wset.size + ' 种</span>';
    $('detailSummary').innerHTML = '共 <b>' + all.length + '</b> 条成绩（按日期新→旧）';
    $('detailHead').innerHTML =
      '<div class="dtitle"><h2>' + esc(pname) + '</h2>' +
      '<div class="dmeta">玩家成绩时间线 · 点击行展开视频与详情</div></div>' +
      '<div class="ctx-tags">' + tags + '</div>';

    var html = '<div class="pv-headrow"><span class="h-date">日期</span>' +
      '<span class="h-w">武器</span><span class="h-m">怪物</span>' +
      '<span class="h-q">任务</span><span class="h-t">成绩</span>' +
      '<span class="h-r">规则</span><span class="h-a"></span></div>';

    if (!all.length) {
      html += '<div class="wv-sub">该玩家暂无成绩。</div>';
    } else {
      all.forEach(function (r) {
        var m = mById[r.monsterId], w = wById[r.weaponId];
        var open = expandedIds.has(r.id);
        html += '<div class="prow' + (open ? ' open' : '') + '" data-id="' + esc(r.id) + '" role="button" tabindex="0">' +
          '<span class="p-date">' + esc(r.date) + '</span>' +
          '<span class="p-w" title="' + esc(w ? w.label : r.weaponId) + '">' +
          '<img src="' + WEAPON_ICON + encodeURIComponent(w ? w.file : '') + '" alt="">' +
          '<span>' + esc(w ? w.label : r.weaponId) + '</span></span>' +
          '<span class="p-m" title="' + esc(m ? m.name : r.monsterId) + '">' +
          '<img src="' + MONSTER_ICON + encodeURIComponent(m ? m.file : '') + '" alt="">' +
          '<span>' + esc(m ? m.name : r.monsterId) + '</span></span>' +
          '<span class="p-q">' + esc(questLabelOf(r)) + '</span>' +
          '<span class="' + tmCls(r.rule) + '">' + fmtTime(r.timeMs) + '</span>' +
          '<span class="tag rule-' + esc(r.rule) + '">' + esc(ruleLabel(r.rule)) + '</span>' +
          '<span class="p-arr">▶</span>' +
          '</div>';
        html += '<div class="detail-box">' + recordDetailHTML(r) + admHtml(r.id) + '</div>';
      });
    }
    var body = $('detailBody');
    body.innerHTML = html;
    body.querySelectorAll('.prow').forEach(function (row) {
      row.addEventListener('click', function () {
        var id = row.dataset.id;
        var open = row.classList.toggle('open');
        if (open) expandedIds.add(id); else expandedIds.delete(id);
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
      });
    });
    bindAdmClicks(body);
  }

  /* ================= 怪物页（全武器最快） ================= */
  function renderMonsterView() {
    var m = mById[state.scope.mid];
    if (!m) { goBack(); return; }
    showArea('monster');
    $('detailHead').innerHTML = commonHead(m);
    var recs = scopeRecords({ mid: m.id, quest: state.scope.quest || null });
    var usedWeapons = {};
    recs.forEach(function (r) { usedWeapons[r.weaponId] = 1; });
    $('detailSummary').innerHTML = '共 <b>' + recs.length + '</b> 条 · 覆盖 <b>' +
      Object.keys(usedWeapons).length + '</b>/14 种武器';

    var ctx = ctxTask();
    if (state.rule !== 'all') ctx += ' · ' + ruleLabel(state.rule);
    var html = '<div class="mv-head">' + esc(ctx) + ' —— 各武器最快成绩（点击某武器查看该位置详情与历史）</div>';
    html += '<div class="mv-headrow"><span class="h-fill"></span><span class="h-name">武器</span>' +
      '<span class="h-time">成绩</span><span class="h-author">玩家</span><span class="h-date">日期</span>' +
      '<span class="h-arr"></span></div>';
    CFG.weapons.forEach(function (w) {
      var wRecs = recs.filter(function (r) { return r.weaponId === w.id; });
      var best = bestOf(wRecs);
      html += '<div class="mv-row' + (best ? '' : ' no-rec') + '"' +
        (best ? ' data-mid="' + m.id + '" data-wid="' + w.id + '"' : '') + '>' +
        '<img src="' + WEAPON_ICON + encodeURIComponent(w.file) + '" alt="">' +
        '<span class="mv-name">' + esc(w.label) + '</span>';
      if (best) {
        html += '<span class="mv-time"><span class="' + tmCls(best.rule) + '">' + fmtTime(best.timeMs) + '</span></span>' +
          '<span class="mv-author pa" data-p="' + esc(best.author) + '" title="查看该玩家全部成绩">' + esc(best.author) + '</span>' +
          '<span class="mv-date">' + esc(best.date) + '</span>' +
          '<span class="mv-arr">›</span>';
      } else {
        html += '<span class="mv-time" style="color:var(--text-dim)">—</span><span class="mv-author"></span>' +
          '<span class="mv-date"></span><span class="mv-arr"></span>';
      }
      html += '</div>';
    });
    var body = $('detailBody');
    body.innerHTML = html;
    body.querySelectorAll('.mv-row[data-mid]').forEach(function (row) {
      row.addEventListener('click', function () {
        openView('weapon', { mid: row.dataset.mid, wid: row.dataset.wid, quest: state.scope.quest || null });
      });
    });
    bindAuthorClicks(body);
  }

  /* ================= 武器页（当前记录 + 历史） ================= */
  function recordDetailHTML(r) {
    var m = mById[r.monsterId], w = wById[r.weaponId];
    var h = '';
    if (r.videos && r.videos.length) {
      h += '<div class="ditem" style="grid-column:1/-1"><div class="dk">视频链接</div><div class="dv">';
      r.videos.forEach(function (v) {
        var si = siteInfo(v.site);
        var ttl = v.title ? v.title : '打开视频';
        h += '<a class="vbtn" href="' + esc(v.url) + '" target="_blank" rel="noopener">' +
          '<span class="site ' + si.cls + '">' + esc(si.label) + '</span>' +
          '<span>' + esc(ttl) + '</span><span style="color:var(--text-dim);font-size:11px">↗</span></a>';
      });
      h += '</div></div>';
    }
    var info = [
      ['任务', questLabelOf(r)],
      ['怪物', m ? m.name : r.monsterId],
      ['武器', w ? w.label : r.weaponId],
      ['规则', ruleLabel(r.rule)],
      ['用时', fmtTime(r.timeMs)],
      ['作者', r.author],
      ['日期', r.date],
      ['平台', platformLabel(r.platform)]
    ];
    info.forEach(function (it) {
      h += '<div class="ditem"><div class="dk">' + esc(it[0]) + '</div><div class="dv">' + esc(it[1]) + '</div></div>';
    });
    return '<div class="dgrid">' + h + '</div>';
  }
  function questLabelOf(r) {
    if (r.questType === 'raging') {
      var q = questObj(r);
      return q ? q.label : '烈祸袭来';
    }
    var t = qtLabel(r.questType);
    if (r.exStar) t += ' · ' + r.exStar;
    return t;
  }
  /* 当前视图的任务语境（避免 “烈祸袭来 · 烈祸袭来：XX” 重复） */
  function ctxTask() {
    if (state.questType === 'raging') {
      var q = state.scope.quest ? qById[state.scope.quest] : null;
      return q ? q.label : '烈祸袭来';
    }
    var t = qtLabel(state.questType);
    var m = state.scope.mid ? mById[state.scope.mid] : null;
    if (m && m.tier) t += ' · ' + tierLabel(m.tier);
    return t;
  }
  function renderWeaponView() {
    var s = state.scope;
    var m = mById[s.mid], w = wById[s.wid];
    if (!m || !w) { goBack(); return; }
    showArea('weapon');
    $('detailHead').innerHTML = commonHead(m);

    var recs = scopeRecords({ mid: m.id, wid: w.id, quest: s.quest || null });
    var current = bestOf(recs);
    var history = recs.filter(function (r) { return r.id !== (current ? current.id : null); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.timeMs - b.timeMs; });
    $('detailSummary').innerHTML = '当前 <b>1</b> 条 · 历史 <b>' + history.length + '</b> 条';

    var ctx = ctxTask();
    var html = '<div class="wv-sub">' + esc(ctx) + (state.rule !== 'all' ? ' · ' + esc(ruleLabel(state.rule)) : '') + ' —— 该武器在此位置的成绩' +
      '　<button type="button" class="btn btn-mini btn-primary" id="wvAddBtn">＋ 为该位置录入成绩</button></div>';
    html += '<div class="cur-card">';
    if (current) {
      html += '<div class="cur-time ' + (current.rule === 'ta' ? 'ta' : current.rule === 'free' ? 'free' : '') + '">' + fmtTime(current.timeMs) + '</div>';
      html += '<div class="cur-meta">';
      html += '<span class="k">规则</span><span>' + esc(ruleLabel(current.rule)) + '</span>';
      html += '<span class="k">作者</span><span class="pa" data-p="' + esc(current.author) + '" title="查看该玩家全部成绩">' + esc(current.author) + '</span>';
      html += '<span class="k">日期</span><span>' + esc(current.date) + '</span>';
      html += '<span class="k">平台</span><span>' + esc(platformLabel(current.platform)) + '</span>';
      html += '</div>';
      html += '<div class="cur-vids">';
      if (current.videos && current.videos.length) {
        current.videos.forEach(function (v) {
          var si = siteInfo(v.site);
          html += '<a class="vbtn" href="' + esc(v.url) + '" target="_blank" rel="noopener">' +
            '<span class="site ' + si.cls + '">' + esc(si.label) + '</span>' +
            '<span>' + esc(v.title || '打开视频') + '</span>' +
            '<span style="color:var(--text-dim);font-size:11px">↗</span></a>';
        });
      } else {
        html += '<span style="color:var(--text-dim);font-size:12px">暂无视频链接</span>';
      }
      html += '</div>';
      html += admHtml(current.id);
    } else {
      html += '<div class="cur-time" style="color:var(--text-dim);font-size:22px">暂无成绩</div>' +
        '<div class="wv-sub" style="margin:0">该位置还没有成绩，可通过「＋ 录入成绩」添加。</div>';
    }
    html += '</div>';

    html += '<div class="hist-title">历史记录<span class="hint">（同位置旧成绩；之后录入更快的成绩替换当前后，旧成绩自动落到这里）</span></div>';
    if (!history.length) {
      html += '<div class="wv-sub">暂无历史记录。</div>';
    } else {
      history.forEach(function (r) {
        var open = expandedIds.has(r.id);
        html += '<div class="hrow' + (open ? ' open' : '') + '" data-id="' + esc(r.id) + '" role="button" tabindex="0">' +
          '<span class="' + tmCls(r.rule) + '">' + fmtTime(r.timeMs) + '</span>' +
          '<span class="h-author pa" data-p="' + esc(r.author) + '" title="查看该玩家全部成绩">' + esc(r.author) + '</span>' +
          '<span class="h-date">' + esc(r.date) + '</span>' +
          '<span class="h-arr">▶</span>' +
          '</div>';
        html += '<div class="detail-box">' + recordDetailHTML(r) + admHtml(r.id) + '</div>';
      });
    }
    var body = $('detailBody');
    body.innerHTML = html;
    body.querySelectorAll('.hrow').forEach(function (row) {
      row.addEventListener('click', function () {
        var id = row.dataset.id;
        var open = row.classList.toggle('open');
        if (open) expandedIds.add(id); else expandedIds.delete(id);
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
      });
    });
    var wvAdd = body.querySelector('#wvAddBtn');
    if (wvAdd) {
      wvAdd.addEventListener('click', function () {
        openEntry({ mid: state.scope.mid, wid: state.scope.wid, quest: state.scope.quest || null });
      });
    }
    bindAuthorClicks(body);
    bindAdmClicks(body);
  }

  /* ================= 总刷新 ================= */
  function update() {
    syncQuestTypeUI();
    syncRuleUI();
    syncExUI();
    renderCond();
    $('filterSummary').textContent = summaryText();
    if (state.view === 'player') renderPlayerView();
    else if (state.view === 'monster') renderMonsterView();
    else if (state.view === 'weapon') renderWeaponView();
    else renderMatrix();
    updateExportState();
    persistState();
  }
  function summaryText() {
    var parts = [];
    parts.push(qtLabel(state.questType));
    if (state.questType === 'raging') parts.push('10 任务');
    else parts.push(state.exSel.size ? Array.from(state.exSel).join('+') : '未选 EX');
    parts.push(ruleLabel(state.rule));
    parts.push('成绩 ' + RECORDS.length + ' 条');
    return '当前：' + parts.join(' · ');
  }
  function resetAll() {
    state.questType = 'raging';
    state.exSel.clear();
    state.rule = 'all';
    state.page = 1;
    state.view = 'matrix';
    state.scope = { mid: null, wid: null, quest: null, player: null };
    expandedIds.clear();
    update();
  }

  /* ================= URL ================= */
  function persistState() {
    try {
      var p = new URLSearchParams();
      p.set('qt', state.questType);
      if (state.exSel.size) p.set('ex', Array.from(state.exSel).join(','));
      if (state.rule !== 'all') p.set('rl', state.rule);
      if (state.view === 'monster' && mById[state.scope.mid]) {
        p.set('v', 'monster'); p.set('mid', state.scope.mid);
        if (state.scope.quest) p.set('q', state.scope.quest);
      } else if (state.view === 'weapon' && mById[state.scope.mid] && wById[state.scope.wid]) {
        p.set('v', 'weapon'); p.set('mid', state.scope.mid); p.set('wid', state.scope.wid);
        if (state.scope.quest) p.set('q', state.scope.quest);
      } else if (state.view === 'player' && state.scope.player) {
        p.set('v', 'player'); p.set('p', state.scope.player);
      }
      var qs = p.toString();
      history.replaceState(null, '', qs ? '?' + qs : location.pathname);
    } catch (e) { /* ignore */ }
  }
  function loadState() {
    try {
      var p = new URLSearchParams(location.search);
      var qt = p.get('qt');
      if (qtObj(qt)) state.questType = qt;
      var ex = p.get('ex');
      if (ex) ex.split(',').forEach(function (s) { if (CFG.exStars.indexOf(s) >= 0) state.exSel.add(s); });
      var rl = p.get('rl');
      if (CFG.rules.some(function (r) { return r.id === rl; })) state.rule = rl;
      var v = p.get('v');
      var mid = p.get('mid');
      if (v === 'player') {
        var pn = p.get('p');
        if (pn) { state.view = 'player'; state.scope.player = pn; }
      } else if (mById[mid] && (v === 'monster' || v === 'weapon')) {
        state.view = v;
        state.scope.mid = mid;
        state.scope.quest = p.get('q') || null;
        if (v === 'weapon' && wById[p.get('wid')]) state.scope.wid = p.get('wid');
        if (v === 'weapon' && !state.scope.wid) state.view = 'monster';
      }
    } catch (e) { /* ignore */ }
  }

  /* ================= GitHub 直存（不依赖本地文件） ================= */
  var GH = CFG.github;
  var TOKEN_KEY = 'mhrs_gh_token';
  function ghB64(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    var CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }
  function ghApiOf(path) {
    return 'https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + path;
  }
  async function ghRead(path, token) {
    var res = await fetch(ghApiOf(path) + '?ref=' + GH.branch, {
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return null;               // 404=文件不存在；401/403 会在写入时报错
    var j = await res.json();
    var bin = atob(j.content);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { sha: j.sha, text: new TextDecoder().decode(bytes) };
  }
  async function ghPut(path, sha, content, message, token) {
    var body = JSON.stringify({ message: message, content: ghB64(content), branch: GH.branch, sha: sha });
    var res = await fetch(ghApiOf(path), {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: body
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error(err.message || ('保存失败（HTTP ' + res.status + '）'));
    }
    var j = await res.json();
    return j.commit ? j.commit.sha : '';
  }
  /* 保存后自动给 index.html 换一个资源版本号，强制浏览器/缓存拉新数据 */
  async function bumpVersion(token) {
    try {
      var meta = await ghRead('index.html', token);
      if (!meta || !meta.text) return;
      var stamp = 'v=' + Date.now();
      var next = meta.text.replace(/\?v=\d+/g, '?' + stamp);
      if (next === meta.text) return;
      await ghPut('index.html', meta.sha, next, '自动刷新资源版本号', token);
    } catch (e) { /* 版本号刷新失败不影响成绩本身 */ }
  }
  async function ghSave(content, token) {
    var meta = await ghRead(GH.dataPath, token);
    var sha = meta ? meta.sha : null;
    var msg = '成绩更新（网页录入） ' + new Date().toISOString().slice(0, 10);
    var newSha = await ghPut(GH.dataPath, sha, content, msg, token);
    bumpVersion(token);   // 不等待，让版本号提交随后跟上
    return newSha;
  }
  function parseArray(txt) {
    try {
      var start = txt.indexOf('['), end = txt.lastIndexOf(']');
      if (start < 0 || end < 0) return null;
      var arr = JSON.parse(txt.slice(start, end + 1));
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }
  /* 合并式保存：先读远端最新数据，只追加/更新本次记录，避免覆盖此前提交 */
  async function ghSaveRecords(delta, token) {
    var remote = await ghRead(GH.dataPath, token);
    var base = null;
    if (remote && remote.text) base = parseArray(remote.text);
    if (!base) base = RECORDS.slice();
    var ids = {};
    base.forEach(function (r) { ids[r.id] = 1; });
    delta.forEach(function (r) { if (!ids[r.id]) { base.push(r); ids[r.id] = 1; } });
    var text = serializeData(base);
    var sha = await ghSave(text, token);
    return { sha: sha, text: text };
  }
  /* 通用变换式保存：读远端最新 → 按 fn 修改 → 提交 */
  async function ghTransform(token, fn) {
    var remote = await ghRead(GH.dataPath, token);
    var base = (remote && parseArray(remote.text)) || RECORDS.slice();
    fn(base);
    var text = serializeData(base);
    var sha = await ghSave(text, token);
    return { sha: sha, text: text };
  }
  function applyDataFromText(txt) {
    var arr = parseArray(txt);
    if (!arr) return false;
    RECORDS.length = 0;
    Array.prototype.push.apply(RECORDS, arr);
    return true;
  }

  function serializeData(records) {
    var head = '/* ============================================================\n' +
      ' * data.js — 成绩数据（由页面「录入成绩」工具生成，可再手工修改）\n' +
      ' * 字段说明见 js/data.js 顶部注释。\n' +
      ' * ============================================================ */\n';
    return head + 'window.MHRS_RECORDS = ' + JSON.stringify(records, null, 2) + ';\n';
  }

  /* ================= 导出矩阵图片（PNG） ================= */
  function loadImg(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }
  function rrect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); return; }
    ctx.fillRect(x, y, w, h);
  }
  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  async function exportMatrixImage() {
    var msg = $('exportMsg');
    var axis = buildAxis();
    if (!axis || !state.questType) {
      msg.textContent = '请先选择任务类型（探究类还需勾选 EX 星级）';
      return;
    }
    msg.textContent = '正在生成图片…';
    var weapons = CFG.weapons;

    /* 布局 */
    var pad = 16, leadW = 66, colW = 126, headH = 88, rowH = 56, topH = 64, footH = 26;
    var gridH = headH + weapons.length * rowH;
    var W = pad * 2 + leadW + axis.length * colW;
    /* 底部图例/落款宽度预测量（窄图时自动加一行，避免文字重叠） */
    var mctx = document.createElement('canvas').getContext('2d');
    mctx.font = '10px "Microsoft YaHei", sans-serif';
    var legText = '白色=三无规则 · 黄色=TA规则';
    var footText = 'MHRS 竞速成绩库 · @星空柠檬凛';
    var extraFoot = (mctx.measureText(legText).width + mctx.measureText(footText).width + pad * 2 + 26 > W) ? 15 : 0;
    var H = pad + topH + gridH + footH + pad + extraFoot;

    var canvas = document.createElement('canvas');
    var SC = 2;
    canvas.width = W * SC;
    canvas.height = H * SC;
    var ctx = canvas.getContext('2d');
    ctx.scale(SC, SC);

    /* 图标加载 */
    var jobs = [];
    axis.forEach(function (it) {
      jobs.push(loadImg(MONSTER_ICON + encodeURIComponent(it.monster.file)).then(function (im) { it._img = im; }));
    });
    weapons.forEach(function (w) {
      jobs.push(loadImg(WEAPON_ICON + encodeURIComponent(w.file)).then(function (im) { w._img = im; }));
    });
    await Promise.all(jobs);

    var C = { bg: '#141519', panel: '#1c1d24', panel2: '#23252e', cell: '#16171e',
      line: '#2c2e38', text: '#e6e4de', dim: '#97959e', ta: '#f2c14e', def: '#efece4',
      free: '#ff6b5e', gold: '#f2c14e', apex: '#3fa9f5', crimson: '#ef7a68' };

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    /* 顶部标题区 */
    var qtName = qtLabel(state.questType);
    var starText = state.questType === 'raging' ? '' :
      (state.exSel.size ? ' · ' + Array.from(state.exSel).sort().join(' + ') : '');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 17px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(qtName + starText + ' 成绩表', pad, pad + 22);
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = C.dim;
    var sub = axis.length + (state.questType === 'raging' ? ' 个烈祸袭来任务' : ' 只怪物') + ' × ' +
      weapons.length + ' 种武器 · ' + (state.rule === 'all' ? '规则：全部（每格为最快成绩）' : '规则：' + ruleLabel(state.rule));
    ctx.fillText(sub, pad, pad + 40);
    ctx.textAlign = 'right';
    var today = new Date();
    ctx.fillText(today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0'), W - pad, pad + 22);

    /* 矩阵主体（导出统一直角，配合分隔线更像成绩表） */
    var gx = pad, gy = pad + topH;
    ctx.fillStyle = C.panel;
    rrect(ctx, gx, gy, leadW + axis.length * colW, gridH, 0);

    /* 表头行 */
    var cornerX = gx, weaponColX = gx + leadW;
    ctx.fillStyle = C.panel2;
    rrect(ctx, cornerX, gy, leadW, headH, 0);
    ctx.fillStyle = C.dim;
    ctx.font = '10.5px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('武 器', cornerX + leadW / 2, gy + headH / 2 + 4);
    axis.forEach(function (it, i) {
      var x = weaponColX + i * colW;
      ctx.fillStyle = C.panel2;
      rrect(ctx, x, gy, colW, headH, 0);
      var cy = gy + 4;
      if (it.kind === 'ex') {
        var bw = it.ex === 'Apex' ? 44 : 38;
        ctx.fillStyle = it.ex === 'Apex' ? C.apex : C.gold;
        rrect(ctx, x + (colW - bw) / 2, cy, bw, 15, 4);
        ctx.fillStyle = '#052238';
        ctx.font = '700 9px "Microsoft YaHei", sans-serif';
        ctx.fillText(it.ex, x + colW / 2, cy + 11.5);
        cy += 19;
      }
      if (it._img) {
        var s = 38;
        ctx.drawImage(it._img, x + (colW - s) / 2, cy, s, s);
        cy += s;
      }
      ctx.fillStyle = C.dim;
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      var label = it.kind === 'raging' ? it.quest.shortLabel : it.monster.name;
      ctx.fillText(fitText(ctx, label, colW - 10), x + colW / 2, gy + headH - 8);
    });

    /* 行：武器 + 成绩格 */
    weapons.forEach(function (w, ri) {
      var y = gy + headH + ri * rowH;
      ctx.fillStyle = C.panel2;
      rrect(ctx, cornerX, y, leadW, rowH, 0);
      if (w._img) {
        var s = 24;
        ctx.drawImage(w._img, cornerX + (leadW - s) / 2, y + 6, s, s);
      }
      ctx.fillStyle = C.dim;
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(w.label, cornerX + leadW / 2, y + rowH - 8);

      axis.forEach(function (it, ci) {
        var x = weaponColX + ci * colW;
        var recs = bracketRecords(it, w.id);
        ctx.fillStyle = C.cell;
        ctx.fillRect(x, y, colW, rowH);
        if (!recs.length) return;
        var best = bestOf(recs);
        /* 时间（格内居中） */
        ctx.textAlign = 'center';
        ctx.font = '700 15px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = best.rule === 'ta' ? C.ta : best.rule === 'free' ? C.free : C.def;
        ctx.fillText(fmtTime(best.timeMs), x + colW / 2, y + 23);
        /* 作者（格内居中） */
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = C.dim;
        var auth = fitText(ctx, best.author, colW - 16);
        ctx.fillText(auth, x + colW / 2, y + 41);
      });
    });

    /* 单元格分隔线（细分隔 + 表头强调，避免串行） */
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    for (var gj = 0; gj <= weapons.length; gj++) {
      var gy2 = gy + headH + gj * rowH;
      ctx.moveTo(weaponColX + 0.5, gy2 + 0.5);
      ctx.lineTo(weaponColX + axis.length * colW + 0.5, gy2 + 0.5);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    for (var gi = 0; gi <= axis.length; gi++) {
      var gx2 = weaponColX + gi * colW;
      ctx.moveTo(gx2 + 0.5, gy + 0.5);
      ctx.lineTo(gx2 + 0.5, gy + gridH + 0.5);
    }
    ctx.stroke();
    /* 表头与数据区之间一条稍明显的分隔线 */
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(weaponColX + 0.5, gy + headH + 0.5);
    ctx.lineTo(weaponColX + axis.length * colW + 0.5, gy + headH + 0.5);
    ctx.stroke();

    /* 图例 + 页脚（窄图自动分两行，避免重叠） */
    ctx.fillStyle = C.dim;
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(legText, pad, gy + gridH + 18);
    ctx.textAlign = 'right';
    ctx.fillText(footText, W - pad, gy + gridH + 18 + extraFoot);

    canvas.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      var fn = qtLabel(state.questType).replace(/[\s/\\:：]/g, '');
      a.download = fn + '-成绩表.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
      msg.textContent = '已导出 ' + axis.length + ' 列 × ' + weapons.length + ' 行 PNG（列数过多时图片较宽，请横向查看）';
    }, 'image/png');
  }
  function updateExportState() {
    var btn = $('exportBtn');
    var ok = state.view === 'matrix' && !!state.questType &&
      (state.questType === 'raging' || state.exSel.size > 0);
    btn.disabled = !ok;
    if (!ok) $('exportMsg').textContent = '';
  }

  /* ================= 投稿 + 审核（Cloudflare Worker） ================= */
  var SUB = CFG.submit || { apiBase: '', adminKeyStorage: 'mhrs_admin_key' };
  function apiBaseOk() { return SUB.apiBase && SUB.apiBase.indexOf('你的用户名') < 0; }
  function getAdminKey() {
    try { return localStorage.getItem(SUB.adminKeyStorage) || ''; } catch (e) { return ''; }
  }
  function setAdminKey(k) {
    try { localStorage.setItem(SUB.adminKeyStorage, k); } catch (e) { }
  }
  function sMsg(t, ok) {
    var m = $('sMsg');
    m.textContent = t;
    m.style.color = ok ? 'var(--good)' : 'var(--danger)';
  }
  function rvMsg(t, ok) {
    var m = $('rvMsg');
    m.textContent = t;
    m.style.color = ok ? 'var(--good)' : 'var(--danger)';
  }
  function fillSelect(id, list, emptyLabel) {
    var sel = $(id);
    if (!sel) return;
    sel.innerHTML = '';
    if (emptyLabel) {
      var op0 = document.createElement('option');
      op0.value = '';
      op0.textContent = emptyLabel;
      sel.appendChild(op0);
    }
    list.forEach(function (it) {
      var op = document.createElement('option');
      op.value = it.id;
      op.textContent = it.label;
      sel.appendChild(op);
    });
  }
  var submitMonsterIds = [];
  /* 按任务类型/EX 刷新“第二级选择”与怪物候选 */
  function refreshSubmitOptions() {
    var qt = $('sQuestType').value;
    var sel = $('sTaskSel');
    sel.innerHTML = '';
    if (qt === 'raging') {
      $('sTaskLabel').textContent = '烈祸任务';
      var ph0 = document.createElement('option');
      ph0.value = '';
      ph0.textContent = '选择烈祸任务';
      sel.appendChild(ph0);
      CFG.ragingQuests.forEach(function (q) {
        var op = document.createElement('option');
        op.value = q.id;
        op.textContent = q.label;
        sel.appendChild(op);
      });
    } else {
      $('sTaskLabel').textContent = 'EX星级';
      var ph0b = document.createElement('option');
      ph0b.value = '';
      ph0b.textContent = '选择 EX 星级';
      sel.appendChild(ph0b);
      CFG.exStars.forEach(function (s) {
        var op = document.createElement('option');
        op.value = s;
        op.textContent = s + (s === 'Apex' ? '（霸主）' : '');
        sel.appendChild(op);
      });
    }
    rebuildMonsterDl();
  }
  function rebuildMonsterDl() {
    var qt = $('sQuestType').value;
    var dl = $('dlMonsters');
    dl.innerHTML = '';
    submitMonsterIds = [];
    var seen = {};
    var ids = [];
    if (qt === 'raging') {
      CFG.ragingQuests.forEach(function (q) {
        var m = mByFile(q.monsterFile);
        if (m && !seen[m.id]) { seen[m.id] = 1; ids.push(m); }
      });
    } else {
      var tier = $('sTaskSel').value;
      if (tier) {
        ids = MONSTERS.filter(function (m) { return m.tier === tier; });
      }
    }
    ids.forEach(function (m) {
      submitMonsterIds.push(m.id);
      var op = document.createElement('option');
      op.value = m.name;
      dl.appendChild(op);
    });
    var mv = $('sMonster').value;
    if (mv && submitMonsterIds.indexOf(resolveMonster(mv)) < 0) $('sMonster').value = '';
  }
  function resolveMonster(v) {
    v = String(v || '').trim();
    if (mById[v]) return v;
    var hit = MONSTERS.find(function (m) {
      return m.name === v || m.file === v || m.file === v + '.png' ||
        m.name.replace(/[·・\s]/g, '').toLowerCase() === v.replace(/[·・\s]/g, '').toLowerCase();
    });
    return hit ? hit.id : null;
  }
  function setupSubmitReview() {
    if (!$('submitBtn') || !$('reviewBtn') || !$('submitModal') || !$('reviewModal')) return;
    var submitIdentifyBtn = $('sVideoIdentify');
    fillSelect('sQuestType', CFG.questTypes, '');
    fillSelect('sWeapon', CFG.weapons, '');
    fillSelect('sRule', CFG.rules, '');
    fillSelect('sPlat', CFG.platforms, '');
    if (apiBaseOk()) $('reviewBtn').classList.remove('hidden');
    if (!apiBaseOk()) {
      $('submitBtn').title = '投稿服务尚未启用（等后端部署后可用）';
      $('reviewBtn').title = '投稿服务尚未启用';
    }
    $('submitBtn').addEventListener('click', function () {
      if (!apiBaseOk()) { window.alert('投稿服务尚未启用：后端部署完成后（见 workers/DEPLOY.md）即可投稿。'); return; }
      $('sMsg').textContent = '';
      $('sAuthor').value = '';
      $('sTime').value = '';
      $('sDate').value = todayStr();
      $('sTitle').value = '';
      $('sBv').value = '';
      $('sMonster').value = '';
      if (submitIdentifyBtn) {
        submitIdentifyBtn.disabled = false;
        submitIdentifyBtn.textContent = '识别';
      }
      $('sQuestType').value = 'special';
      refreshSubmitOptions();
      $('sTaskSel').value = '';
      rebuildMonsterDl();
      $('sRule').value = '';
      $('sPlat').value = 'steam';
      $('submitModal').classList.remove('hidden');
    });
    $('sClose').addEventListener('click', function () { $('submitModal').classList.add('hidden'); });
    $('submitModal').addEventListener('click', function (e) { if (e.target === $('submitModal')) $('submitModal').classList.add('hidden'); });
    $('sQuestType').addEventListener('change', function () {
      refreshSubmitOptions();
      $('sTaskSel').value = '';
      rebuildMonsterDl();
    });
    $('sTaskSel').addEventListener('change', function () {
      rebuildMonsterDl();
    });
    $('sSend').addEventListener('click', submitSend);
    if (submitIdentifyBtn) submitIdentifyBtn.addEventListener('click', identifySubmitBiliVideo);
    $('reviewBtn').addEventListener('click', function () {
      if (!apiBaseOk()) { window.alert('投稿服务尚未启用。'); return; }
      if (!getAdminKey()) {
        var k = window.prompt('请输入审核口令（管理员用）：');
        if (!k) return;
        setAdminKey(k);
        $('reviewBtn').classList.remove('hidden');
      }
      $('reviewModal').classList.remove('hidden');
      reviewLoad();
    });
    $('rvClose').addEventListener('click', function () { $('reviewModal').classList.add('hidden'); });
    $('reviewModal').addEventListener('click', function (e) { if (e.target === $('reviewModal')) $('reviewModal').classList.add('hidden'); });
  }
  /* ＋ 格子无令牌 → 自动转投稿弹窗（按所点格子预填 任务/怪物/武器） */
  function openSubmitPrefill(qt, q, m, w) {
    $('sMsg').textContent = '';
    var ident = $('sVideoIdentify');
    if (ident) {
      ident.disabled = false;
      ident.textContent = '识别';
    }
    $('sAuthor').value = '';
    $('sTime').value = '';
    $('sDate').value = todayStr();
    $('sTitle').value = '';
    $('sBv').value = '';
    $('sQuestType').value = qt;
    refreshSubmitOptions();
    var filledTask = false;
    if (qt === 'raging') {
      if (q && $('sTaskSel').querySelector('option[value="' + q.id + '"]')) {
        $('sTaskSel').value = q.id;
        filledTask = true;
      }
    } else if (m.tier && CFG.exStars.indexOf(m.tier) >= 0) {
      $('sTaskSel').value = m.tier;
      filledTask = true;
    }
    rebuildMonsterDl();
    $('sMonster').value = m.name;
    $('sWeapon').value = w.id;
    if (state.rule !== 'all' && $('sRule').querySelector('option[value="' + state.rule + '"]')) {
      $('sRule').value = state.rule;
    } else {
      $('sRule').value = '';
    }
    $('sPlat').value = 'steam';
    if (!filledTask) {
      var pm = $('sMsg');
      pm.textContent = '已按所选格子预填怪物与武器，请再补充任务/EX 星级';
      pm.style.color = 'var(--text-dim)';
    }
    $('submitModal').classList.remove('hidden');
    $('sAuthor').focus();
  }
  async function identifySubmitBiliVideo() {
    var input = $('sBv');
    var btn = $('sVideoIdentify');
    var raw = input.value.trim();
    if (!raw) { sMsg('请先粘贴 B 站视频链接或 BV 号', false); input.focus(); return; }
    btn.disabled = true;
    btn.textContent = '识别中…';
    sMsg('正在读取 B 站视频信息…', true);
    try {
      var data = await fetchBiliInfo(raw);
      var info = biliInfoFields(data, raw);
      if (info.title) $('sTitle').value = info.title;
      if (info.author) $('sAuthor').value = info.author;
      if (info.date) $('sDate').value = info.date;
      if (info.time) $('sTime').value = info.time;
      if (info.questType) {
        var questTypeSel = $('sQuestType');
        if (questTypeSel.querySelector('option[value="' + info.questType + '"]')) {
          questTypeSel.value = info.questType;
          refreshSubmitOptions();
          $('sTaskSel').value = '';
          if (info.task && $('sTaskSel').querySelector('option[value="' + info.task + '"]')) {
            $('sTaskSel').value = info.task;
          }
          rebuildMonsterDl();
        }
      }
      if (info.rule) {
        var ruleSel = $('sRule');
        if (ruleSel.querySelector('option[value="' + info.rule + '"]')) ruleSel.value = info.rule;
      }
      if (info.monsterId && mById[info.monsterId]) $('sMonster').value = mById[info.monsterId].name;
      if (info.weaponId) {
        var weaponSel = $('sWeapon');
        if (weaponSel.querySelector('option[value="' + info.weaponId + '"]')) weaponSel.value = info.weaponId;
      }
      if (info.bvid) $('sBv').value = 'https://www.bilibili.com/video/' + info.bvid;
      var fields = ['视频标题', 'UP 主', '日期'];
      if (info.questType) fields.push('任务类型');
      if (info.task) fields.push(info.questType === 'raging' ? '烈祸任务' : 'EX星级');
      if (info.time) fields.push('用时');
      if (info.rule) fields.push('规则');
      if (info.monsterId) fields.push('怪物');
      if (info.weaponId) fields.push('武器');
      sMsg('已识别并回填' + fields.join('、'), true);
    } catch (e) {
      sMsg('识别失败：' + e.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = '识别';
    }
  }
  async function submitSend() {
    if (!apiBaseOk()) { sMsg('投稿服务未启用', false); return; }
    var qt = $('sQuestType').value;
    if (!qt) { sMsg('请先选择任务类型', false); return; }
    var quest = null;
    var ex = null;
    if (qt === 'raging') {
      quest = $('sTaskSel').value;
      if (!quest) { sMsg('请选择烈祸任务', false); return; }
    } else {
      ex = $('sTaskSel').value;
      if (!ex) { sMsg('请选择 EX 星级', false); return; }
    }
    var mid = resolveMonster($('sMonster').value);
    if (!mid) { sMsg('请选择怪物（仅显示当前任务下的怪物）', false); return; }
    if (submitMonsterIds.indexOf(mid) < 0) { sMsg('该怪物不属于当前任务/EX 分级，请重新选择', false); return; }
    var wid = $('sWeapon').value;
    var rule = $('sRule').value;
    var author = $('sAuthor').value.trim();
    var date = normDate($('sDate').value);
    var ms = parseTime($('sTime').value);
    if (!wid) { sMsg('请选择武器', false); return; }
    if (!rule) { sMsg('请选择规则', false); return; }
    if (!author) { sMsg('请填写作者', false); return; }
    if (ms == null) { sMsg('用时格式不对（如 05\'02\'\'52）', false); return; }
    if (!date) { sMsg('日期格式不对（如 2026-9-6）', false); return; }
    var payload = {
      questType: qt,
      quest: quest,
      exStar: ex,
      rule: rule,
      monsterId: mid,
      weaponId: wid,
      timeMs: ms,
      author: author,
      date: date,
      title: $('sTitle').value.trim(),
      bv: $('sBv').value.trim(),
      platform: $('sPlat').value || 'steam',
      website: $('sWebsite').value
    };
    sMsg('正在发送…', true);
    try {
      var res = await fetch(SUB.apiBase + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var j = await res.json();
      if (j.ok) {
        sMsg('投稿成功！请等待管理员审核通过后发布。', true);
        $('sAuthor').value = ''; $('sTime').value = ''; $('sBv').value = ''; $('sMonster').value = ''; $('sTaskSel').value = '';
        setTimeout(function () { $('submitModal').classList.add('hidden'); }, 1600);
      } else {
        sMsg('投稿失败：' + (j.error || '未知错误'), false);
      }
    } catch (e) {
      sMsg('网络错误：' + e.message + '。若提示跨域/CORS，请检查 Worker 的 ALLOWED_ORIGIN 是否包含当前网址并重新 Deploy', false);
    }
  }
  async function reviewLoad() {
    rvMsg('正在读取待审…', true);
    var listBox = $('rvList');
    listBox.innerHTML = '';
    try {
      var res = await fetch(SUB.apiBase + '/pending', { headers: { 'x-admin-key': getAdminKey() } });
      var j = await res.json();
      if (!j.ok) {
        rvMsg('读取失败：' + (j.error || '无权限'), false);
        if (String(j.error || '').indexOf('无权限') >= 0) {
          try { localStorage.removeItem(SUB.adminKeyStorage); } catch (e) { }
          var k = window.prompt('口令错误或未设置，请重新输入审核口令：');
          if (k) { setAdminKey(k); reviewLoad(); }
        }
        return;
      }
      var list = j.list || [];
      $('rvSub').textContent = '共 ' + list.length + ' 条待审投稿';
      if (!list.length) {
        listBox.innerHTML = '<div class="wv-sub">暂无待审投稿。</div>';
        rvMsg('', true);
        return;
      }
      list.forEach(function (s) {
        var m = mById[s.monsterId], w = wById[s.weaponId];
        var task = qtLabel(s.questType);
        if (s.questType === 'raging') {
          var q = questObj(s);
          task += q ? ' · ' + q.label : '';
        } else if (s.exStar) {
          task += ' · ' + s.exStar;
        }
        var v = s.videos && s.videos[0];
        listBox.insertAdjacentHTML('beforeend',
          '<div class="rv-item" data-id="' + esc(s.id) + '">' +
          '<div class="rv-top"><span class="rv-time">' + fmtTime(s.timeMs) + '</span>' +
          '<span class="tag rule-' + esc(s.rule) + '">' + esc(ruleLabel(s.rule)) + '</span>' +
          '<span><b>' + esc(s.author) + '</b></span>' +
          '<span class="rv-meta">' + esc(task) + ' · ' + esc(m ? m.name : s.monsterId) + ' × ' + esc(w ? w.label : s.weaponId) + ' · ' + esc(s.date) + ' · ' + esc(platformLabel(s.platform)) + '</span></div>' +
          '<div class="rv-title">' + (v ? '<a class="vbtn" href="' + esc(v.url) + '" target="_blank" rel="noopener"><span class="site site-bilibili">B站</span>' + esc(v.title || '打开视频') + ' ↗</a>' : '（未附视频）') + '</div>' +
          '<div class="rv-actions">' +
          '<button type="button" class="btn btn-mini ok rv-ok">✓ 通过并发布</button>' +
          '<button type="button" class="btn btn-mini no rv-no">✕ 驳回</button>' +
          '</div></div>');
      });
      bindReviewActions();
      rvMsg('', true);
    } catch (e) {
      rvMsg('网络错误：' + e.message, false);
    }
  }
  function bindReviewActions() {
    var listBox = $('rvList');
    listBox.querySelectorAll('.rv-ok').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.closest('.rv-item').dataset.id;
        b.disabled = true;
        rvMsg('正在发布…', true);
        try {
          var res = await fetch(SUB.apiBase + '/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': getAdminKey() },
            body: JSON.stringify({ id: id })
          });
          var j = await res.json();
          if (j.ok) {
            window.alert('已发布（commit ' + j.sha.slice(0, 7) + '），页面即将刷新。');
            window.location.reload();
          } else {
            rvMsg('发布失败：' + (j.error || ''), false);
            b.disabled = false;
          }
        } catch (e) { rvMsg('网络错误：' + e.message, false); b.disabled = false; }
      });
    });
    listBox.querySelectorAll('.rv-no').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.closest('.rv-item').dataset.id;
        if (!window.confirm('确定驳回并删除这条投稿吗？')) return;
        try {
          var res = await fetch(SUB.apiBase + '/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': getAdminKey() },
            body: JSON.stringify({ id: id })
          });
          var j = await res.json();
          rvMsg(j.ok ? '已驳回' : ('驳回失败：' + (j.error || '')), !!j.ok);
          reviewLoad();
        } catch (e) { rvMsg('网络错误：' + e.message, false); }
      });
    });
  }

  /* ================= 初始化 ================= */
  function init() {
    document.title = CFG.siteTitle;
    $('siteTitle').textContent = CFG.siteTitle;
    $('siteSubtitle').textContent = CFG.siteSubtitle;
    syncThemeUI();
    var tBtn = $('themeBtn');
    if (tBtn) {
      tBtn.addEventListener('click', function () {
        var next = isLight() ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { }
        syncThemeUI();
        update();
      });
    }
    loadState();
    renderQuestTypeUI();
    renderRuleUI();
    renderExUI();
    $('resetBtn').addEventListener('click', resetAll);
    $('backBtn').addEventListener('click', goBack);
    $('exportBtn').addEventListener('click', function () {
      exportMatrixImage();
    });
    var rModal = $('rulesModal');
    var RULES_SEEN_KEY = 'mhrs_rules_seen';
    function markRulesSeen() { try { sessionStorage.setItem(RULES_SEEN_KEY, '1'); } catch (e) { } }
    function openRulesModal() { rModal.classList.remove('hidden'); }
    function closeRulesModal() { rModal.classList.add('hidden'); markRulesSeen(); }
    $('rulesBtn').addEventListener('click', openRulesModal);
    $('rulesClose').addEventListener('click', closeRulesModal);
    rModal.addEventListener('click', function (e) { if (e.target === rModal) closeRulesModal(); });
    var axBtn = $('anomalyBtn');
    if (axBtn) axBtn.addEventListener('click', openAnomalyRules);
    var rAxBtn = $('rulesAnomalyBtn');
    if (rAxBtn) rAxBtn.addEventListener('click', openAnomalyRules);
    var axBack = $('anomalyBack');
    if (axBack) axBack.addEventListener('click', closeAnomalyRules);

    /* 快速录入弹窗 */
    var ruleSel = $('eRule');
    ruleSel.innerHTML = '<option value="">— 请选择规则 —</option>';
    CFG.rules.forEach(function (r) {
      var op = document.createElement('option');
      op.value = r.id; op.textContent = r.label;
      ruleSel.appendChild(op);
    });
    var platSel = $('ePlat');
    platSel.innerHTML = '';
    CFG.platforms.forEach(function (p) {
      var op = document.createElement('option');
      op.value = p.id; op.textContent = p.label;
      platSel.appendChild(op);
    });
    var eModal = $('entryModal');
    $('entryClose').addEventListener('click', function () { eModal.classList.add('hidden'); });
    eModal.addEventListener('click', function (e) { if (e.target === eModal) eModal.classList.add('hidden'); });
    $('eSave').addEventListener('click', function () { saveEntry(); });
    var identifyBtn = $('eVideoIdentify');
    if (identifyBtn) identifyBtn.addEventListener('click', identifyBiliVideo);

    setupSubmitReview();

    update();

    /* 打开网站自动弹出收录规则（本会话内手动关闭后不再自动弹，刷新页面后仍会弹） */
    var rulesSeen = false;
    try { rulesSeen = !!sessionStorage.getItem(RULES_SEEN_KEY); } catch (e) { }
    if (!rulesSeen && rModal) {
      setTimeout(function () {
        var busy = ['submitModal', 'reviewModal', 'entryModal'].some(function (id) {
          var el = document.getElementById(id);
          return el && !el.classList.contains('hidden');
        });
        if (!busy) rModal.classList.remove('hidden');
      }, 900);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
