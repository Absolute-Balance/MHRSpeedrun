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
  function fmtTime(ms) {
    if (!(ms >= 0)) return '--:--.--';
    var cs = Math.floor(ms / 10);
    var m = Math.floor(cs / 6000);
    var s = Math.floor((cs % 6000) / 100);
    var c = cs % 100;
    return m + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
  }
  function parseTime(str) {
    var t = String(str).trim();
    var m = t.match(/^(?:(\d+):)?(\d{1,2})(?:[.:](\d{1,3}))?$/);
    if (!m) return null;
    var mins = m[1] ? parseInt(m[1], 10) : 0;
    var secs = parseInt(m[2], 10);
    var frac = m[3] ? m[3] : '';
    var ms = (mins * 60 + secs) * 1000;
    if (frac.length === 1) ms += parseInt(frac, 10) * 100;
    else if (frac.length === 2) ms += parseInt(frac, 10) * 10;
    else if (frac.length === 3) ms += parseInt(frac, 10);
    return ms;
  }
  function qtObj(id) { return CFG.questTypes.find(function (q) { return q.id === id; }) || null; }
  function qtLabel(id) { var q = qtObj(id); return q ? q.label : '未选择'; }
  function ruleObj(id) {
    if (id === 'all') return { label: '规则不限', id: 'all' };
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
  function tmCls(rule) { return rule === 'ta' ? 'tm ta' : 'tm'; }
  function siteInfo(site) {
    site = String(site || '').toLowerCase();
    if (site === 'bilibili') return { label: 'B站', cls: 'site-bilibili' };
    if (site === 'youtube') return { label: 'YouTube', cls: 'site-youtube' };
    return { label: site || '视频', cls: 'site-other' };
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
    $('questReset').addEventListener('click', function () {
      state.questType = 'raging';
      state.view = 'matrix';
      update();
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
    var opts = [{ id: 'all', label: '规则不限' }].concat(CFG.rules);
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
      if (state.questType === 'raging') {
        prompt.textContent = '烈祸袭来任务共 10 个，将直接作为横轴展示。';
        return;
      }
      prompt.textContent = '请选择 EX 星级（EX1~EX9 / Apex，可多选），对应怪物将作为矩阵横轴。';
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
    var headDesc = state.questType === 'raging' ? '10 个烈祸袭来任务' : '横轴 ' + axis.length + ' 只（含 Apex 档）';
    $('matrixSub').textContent = headDesc + ' × 14 武器 · 每格只显示最新最快 · 黄色=TA规则 白色=其他规则 · 点怪物头像看全武器，点成绩格看该武器';

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
          html += '<div class="mx-cell empty"></div>';
          return;
        }
        var best = bestOf(recs);
        var inner = '<div class="line1"><span class="' + tmCls(best.rule) + '">' + fmtTime(best.timeMs) + '</span>';
        if (state.rule === 'all') {
          inner += '<span class="rg">' + esc(ruleLabel(best.rule)) + '</span>';
        }
        inner += '</div>';
        inner += '<div class="line2"><span class="mxauthor pa" data-p="' + esc(best.author) + '" title="查看该玩家全部成绩">' + esc(best.author) + '</span>' +
          (recs.length > 1 ? '<span class="mxmore">历史 ' + (recs.length - 1) + '</span>' : '') + '</div>';
        html += '<div class="mx-cell" data-mid="' + it.monster.id + '" data-quest="' +
          (it.kind === 'raging' ? it.quest.id : '') + '" data-wid="' + w.id + '">' + inner + '</div>';
      });
    });
    grid.innerHTML = html;
    grid.style.gridTemplateColumns = '62px repeat(' + n + ', minmax(112px, 1fr))';

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
    if (state.view === 'player') {
      if (state.prev === 'weapon' && state.scope.mid && state.scope.wid) return '← 返回武器页';
      if (state.prev === 'monster' && state.scope.mid) return '← 返回怪物页';
      return '← 返回矩阵';
    }
    if (state.view === 'weapon' && state.prev === 'monster') return '← 返回怪物页';
    return '← 返回矩阵';
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

    var initial = Array.from(pname)[0] || '?';
    var tags = '<span class="tag">成绩 ' + all.length + ' 条</span>' +
      '<span class="tag">武器 ' + wset.size + ' 种</span>';
    $('detailSummary').innerHTML = '共 <b>' + all.length + '</b> 条成绩（按日期新→旧）';
    $('detailHead').innerHTML =
      '<div class="p-avatar">' + esc(initial) + '</div>' +
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
        html += '<div class="detail-box">' + recordDetailHTML(r) + '</div>';
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

    var ctx = qtLabel(state.questType);
    if (state.scope.quest && qById[state.scope.quest]) ctx += ' · ' + qById[state.scope.quest].label;
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
          '<span class="mv-author pa" data-p="' + esc(best.author) + '" title="查看该玩家全部成绩">' + esc(best.author) + (best.videos && best.videos.length ? ' 📹' : '') + '</span>' +
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
        var ttl = v.title ? v.title : (si.label + ' · ' + r.author);
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
      ['平台', r.platform || '—'],
      ['记录编号', r.id]
    ];
    info.forEach(function (it) {
      h += '<div class="ditem"><div class="dk">' + esc(it[0]) + '</div><div class="dv">' + esc(it[1]) + '</div></div>';
    });
    return '<div class="dgrid">' + h + '</div>';
  }
  function questLabelOf(r) {
    var t = qtLabel(r.questType);
    if (r.questType === 'raging') {
      var q = questObj(r);
      t += ' · ' + (q ? q.label : (r.quest || ''));
    } else if (r.exStar) {
      t += ' · ' + r.exStar;
    }
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

    var ctx = qtLabel(state.questType) + ' · ' + (s.quest && qById[s.quest] ? qById[s.quest].label : (m.tier ? m.tier : ''));
    var html = '<div class="wv-sub">' + esc(ctx) + (state.rule !== 'all' ? ' · ' + esc(ruleLabel(state.rule)) : '') + ' —— 该武器在此位置的成绩</div>';
    html += '<div class="cur-card">';
    if (current) {
      html += '<div class="cur-time' + (current.rule === 'ta' ? ' ta' : '') + '">' + fmtTime(current.timeMs) + '</div>';
      html += '<div class="cur-meta">';
      html += '<span class="k">规则</span><span>' + esc(ruleLabel(current.rule)) + '</span>';
      html += '<span class="k">作者</span><span class="pa" data-p="' + esc(current.author) + '" title="查看该玩家全部成绩">' + esc(current.author) + '</span>';
      html += '<span class="k">日期</span><span>' + esc(current.date) + '</span>';
      html += '<span class="k">平台</span><span>' + esc(current.platform || '—') + '</span>';
      html += '</div>';
      html += '<div class="cur-vids">';
      if (current.videos && current.videos.length) {
        current.videos.forEach(function (v) {
          var si = siteInfo(v.site);
          html += '<a class="vbtn" href="' + esc(v.url) + '" target="_blank" rel="noopener">' +
            '<span class="site ' + si.cls + '">' + esc(si.label) + '</span>' +
            '<span>' + esc(v.title || (si.label + ' · ' + current.author)) + '</span>' +
            '<span style="color:var(--text-dim);font-size:11px">↗</span></a>';
        });
      } else {
        html += '<span style="color:var(--text-dim);font-size:12px">暂无视频链接</span>';
      }
      html += '</div>';
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
        html += '<div class="detail-box">' + recordDetailHTML(r) + '</div>';
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
    bindAuthorClicks(body);
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

  /* ================= 录入 ================= */
  function normWeapon(v) {
    v = String(v).trim();
    if (wById[v]) return v;
    var hit = CFG.weapons.find(function (w) { return w.label === v || w.file === v; });
    return hit ? hit.id : null;
  }
  function cleanName(s) { return String(s).replace(/[·・\s]/g, ''); }
  function normMonster(v) {
    v = String(v).trim();
    if (mById[v]) return v;
    var cv = cleanName(v).toLowerCase();
    var hit = MONSTERS.find(function (m) {
      return m.file === v || m.file === v + '.png' || cleanName(m.name).toLowerCase() === cv;
    });
    return hit ? hit.id : null;
  }
  function normQuestType(v) {
    var low = String(v).trim().toLowerCase().replace(/\s+/g, '');
    var map = {
      '烈祸袭来': 'raging', '烈祸': 'raging', '烈祸来袭': 'raging', 'raging': 'raging', '大师任务': 'raging', '大师': 'raging',
      '怪异探究lv300': 'anomaly300', '怪异探究': 'anomaly300', '怪异探究300': 'anomaly300', 'lv300': 'anomaly300', '300': 'anomaly300', '怪异': 'anomaly300', 'anomaly300': 'anomaly300',
      '特别探究': 'special', '特别': 'special', 'special': 'special'
    };
    return map[low] || null;
  }
  function normEx(v) {
    v = String(v).trim().toUpperCase().replace(/\s+/g, '');
    if (v === 'APEX') return 'Apex';
    var m = v.match(/^(?:EX)?([1-9])$/);
    if (m) return 'EX' + m[1];
    if (CFG.exStars.indexOf(v) >= 0) return v;
    return null;
  }
  function normQuestExtra(v, qt) {
    v = String(v).trim();
    if (qt === 'raging') {
      var low = v.toLowerCase().replace(/\s+/g, '');
      if (qById[v]) return { quest: v };
      var norm = function (s) { return s.toLowerCase().replace(/\s+/g, ''); };
      var hits = CFG.ragingQuests.filter(function (q) {
        return norm(q.label).indexOf(low) >= 0 || norm(q.shortLabel).indexOf(low) >= 0;
      });
      if (hits.length === 1) return { quest: hits[0].id };
      if (hits.length > 1) {
        hits.sort(function (a, b) { return b.label.length - a.label.length; });
        return { quest: hits[0].id };
      }
      return null;
    }
    var ex = normEx(v);
    return ex ? { ex: ex } : null;
  }
  function normRule(v) {
    var low = String(v).trim().toLowerCase().replace(/\s+/g, '');
    if (low === '三无' || low === 'sanyou') return 'sanyou';
    if (low === 'ta规则' || low === 'ta' || low === 'tarules') return 'ta';
    if (low === '无限制' || low === 'free' || low === '不限' || low === 'freestyle') return 'free';
    return null;
  }
  function parseImportLines(text) {
    var lines = text.split(/\r?\n/);
    var out = [], errors = [];
    lines.forEach(function (line, idx) {
      var ln = idx + 1;
      if (!line.trim()) return;
      if (/^\s*[#/]/.test(line)) return;
      var f = line.split(',').map(function (s) { return s.trim(); });
      if (f.length < 8) { errors.push('第 ' + ln + ' 行：字段不足（至少 8 项）'); return; }
      var mid = normMonster(f[0]);
      if (!mid) { errors.push('第 ' + ln + ' 行：找不到怪物 “' + f[0] + '”'); return; }
      var wid = normWeapon(f[1]);
      if (!wid) { errors.push('第 ' + ln + ' 行：找不到武器 “' + f[1] + '”'); return; }
      var qt = normQuestType(f[2]);
      if (!qt) { errors.push('第 ' + ln + ' 行：任务类型无法识别 “' + f[2] + '”（烈祸袭来/怪异探究Lv300/特别探究）'); return; }
      var extra = normQuestExtra(f[3], qt);
      if (!extra) { errors.push('第 ' + ln + ' 行：' + qtLabel(qt) + ' 需要 EX/Apex 星级或烈祸任务 “' + f[3] + '”'); return; }
      var rule = normRule(f[4]);
      if (!rule) { errors.push('第 ' + ln + ' 行：规则无法识别 “' + f[4] + '”'); return; }
      var ms = parseTime(f[5]);
      if (ms == null) { errors.push('第 ' + ln + ' 行：用时格式不对 “' + f[5] + '”（如 5:47.33）'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f[7])) { errors.push('第 ' + ln + ' 行：日期格式应为 YYYY-MM-DD “' + f[7] + '”'); return; }
      var rec = {
        id: 'r' + Date.now().toString(36) + '-' + (out.length + 1),
        questType: qt,
        quest: qt === 'raging' ? extra.quest : null,
        exStar: qt === 'raging' ? null : (extra.ex || null),
        rule: rule,
        monsterId: mid,
        weaponId: wid,
        timeMs: ms,
        author: f[6],
        date: f[7],
        videos: f[8] ? [{ site: /youtu/.test(f[8]) ? 'youtube' : /bilibili/.test(f[8]) ? 'bilibili' : 'other', url: f[8], title: '' }] : [],
        platform: 'pc',
        note: f[9] || ''
      };
      out.push(rec);
    });
    return { out: out, errors: errors };
  }
  function serializeData(records) {
    var head = '/* ============================================================\n' +
      ' * data.js — 成绩数据（由页面「录入成绩」工具生成，可再手工修改）\n' +
      ' * 字段说明见 js/data.js 顶部注释。\n' +
      ' * ============================================================ */\n';
    return head + 'window.MHRS_RECORDS = ' + JSON.stringify(records, null, 2) + ';\n';
  }
  function setupImport() {
    var modal = $('importModal');
    $('openImportBtn').addEventListener('click', function () {
      modal.classList.remove('hidden');
      $('impMsg').textContent = '';
      $('impOut').value = '';
    });
    $('importClose').addEventListener('click', function () { modal.classList.add('hidden'); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden'); });
    $('impParse').addEventListener('click', function () {
      var msg = $('impMsg');
      var res = parseImportLines($('impInput').value);
      if (res.errors.length) {
        msg.textContent = res.errors.length + ' 处错误：\n' + res.errors.join('\n');
        msg.style.color = 'var(--danger)';
        $('impOut').value = '';
        return;
      }
      if (!res.out.length) { msg.textContent = '没有可解析的内容。'; msg.style.color = 'var(--danger)'; return; }
      var merged = RECORDS.concat(res.out);
      var txt = serializeData(merged);
      $('impOut').value = txt;
      msg.textContent = '成功解析 ' + res.out.length + ' 条，现有 ' + RECORDS.length + ' 条 → 合并后共 ' + merged.length + ' 条。';
      msg.style.color = 'var(--good)';
    });
    $('impDownload').addEventListener('click', function () {
      var txt = $('impOut').value;
      if (!txt) return;
      var blob = new Blob([txt], { type: 'text/javascript;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'data.js';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
    });
    $('impCopy').addEventListener('click', function () {
      var txt = $('impOut').value;
      if (!txt) return;
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { }
        ta.remove();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).catch(fallback);
      } else fallback();
    });
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
    var H = pad + topH + gridH + footH + pad;

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
      gold: '#f2c14e', purple: '#b98cff', crimson: '#ef7a68' };

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
    ctx.fillText(qtName + starText + ' 成绩矩阵', pad, pad + 22);
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = C.dim;
    var sub = axis.length + (state.questType === 'raging' ? ' 个烈祸袭来任务' : ' 只怪物') + ' × ' +
      weapons.length + ' 种武器 · ' + (state.rule === 'all' ? '规则不限（每格=最新最快）' : '规则：' + ruleLabel(state.rule));
    ctx.fillText(sub, pad, pad + 40);
    ctx.textAlign = 'right';
    var today = new Date();
    ctx.fillText(today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0'), W - pad, pad + 22);

    /* 矩阵主体 */
    var gx = pad, gy = pad + topH;
    ctx.fillStyle = C.panel;
    rrect(ctx, gx, gy, leadW + axis.length * colW, gridH, 10);

    /* 表头行 */
    var cornerX = gx, weaponColX = gx + leadW;
    ctx.fillStyle = C.panel2;
    rrect(ctx, cornerX, gy, leadW, headH, 8);
    ctx.fillStyle = C.dim;
    ctx.font = '10.5px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('武 器', cornerX + leadW / 2, gy + headH / 2 + 4);
    axis.forEach(function (it, i) {
      var x = weaponColX + i * colW;
      ctx.fillStyle = C.panel2;
      rrect(ctx, x, gy, colW, headH, 8);
      var cy = gy + 4;
      if (it.kind === 'ex') {
        var bw = it.ex === 'Apex' ? 44 : 38;
        ctx.fillStyle = it.ex === 'Apex' ? C.purple : C.gold;
        rrect(ctx, x + (colW - bw) / 2, cy, bw, 15, 4);
        ctx.fillStyle = '#180f2e';
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
      rrect(ctx, cornerX, y, leadW, rowH, 6);
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
        /* 时间 */
        ctx.textAlign = 'left';
        ctx.font = '700 15px Consolas, Menlo, monospace';
        ctx.fillStyle = best.rule === 'ta' ? C.ta : C.def;
        var timeW = ctx.measureText(fmtTime(best.timeMs)).width;
        var tx = x + 8;
        ctx.fillText(fmtTime(best.timeMs), tx, y + 23);
        /* 规则小标 */
        if (state.rule === 'all') {
          var rl = ruleLabel(best.rule);
          ctx.font = '9px "Microsoft YaHei", sans-serif';
          var rw = ctx.measureText(rl).width + 8;
          ctx.fillStyle = C.dim;
          ctx.fillText(rl, tx + timeW + 6, y + 23);
        }
        /* 作者 */
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = C.dim;
        var auth = fitText(ctx, best.author, colW - 16);
        ctx.fillText(auth, tx, y + 41);
        /* 历史标记 */
        if (recs.length > 1) {
          ctx.textAlign = 'right';
          var his = '历史 ' + (recs.length - 1);
          ctx.fillText(his, x + colW - 8, y + 41);
          ctx.textAlign = 'left';
        }
      });
    });

    /* 图例 + 页脚 */
    ctx.fillStyle = C.dim;
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('黄色=TA规则 · 白色=其他规则 · 同格存在更早成绩时右下角显示历史数', pad, gy + gridH + 18);
    ctx.textAlign = 'right';
    ctx.fillText('MHRS 竞速成绩库 · @星空柠檬凛', W - pad, gy + gridH + 18);

    canvas.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      var fn = qtLabel(state.questType).replace(/[\s/\\:：]/g, '');
      a.download = fn + '-矩阵.png';
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

  /* ================= 初始化 ================= */
  function init() {
    document.title = CFG.siteTitle;
    $('siteTitle').textContent = CFG.siteTitle;
    $('siteSubtitle').textContent = CFG.siteSubtitle;
    loadState();
    renderQuestTypeUI();
    renderRuleUI();
    renderExUI();
    $('resetBtn').addEventListener('click', resetAll);
    $('backBtn').addEventListener('click', goBack);
    $('exportBtn').addEventListener('click', function () {
      exportMatrixImage();
    });
    setupImport();
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
