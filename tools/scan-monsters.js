/* ============================================================
 * tools/scan-monsters.js — 由 monsters/ 图标目录 + data/monster-order.json
 * 重建 js/monsters.js
 *
 * 用法（在项目根目录执行）：node tools/scan-monsters.js
 *
 * 显示顺序 = data/monster-order.json 里的 order（tier 分组顺序），
 * 想调整怪物排列、新增怪物时改那个 JSON（或直接把新图标放进
 * monsters/ 并加到 order 里）再重跑本脚本。
 * 显示名 = 图标文件名（去掉扩展名）；如想不改文件名仅换显示名，
 * 可填写 data/monster-names.json：{ "文件名.png": "显示名" }
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const imgDir = path.join(root, 'monsters');
const outFile = path.join(root, 'js', 'monsters.js');
const orderFile = path.join(root, 'data', 'monster-order.json');
const namesFile = path.join(root, 'data', 'monster-names.json');
const idsFile = path.join(root, 'data', 'monster-ids.json');

const IMG_RE = /\.(png|jpe?g|webp|gif|svg)$/i;

let overrides = {};
if (fs.existsSync(namesFile)) {
  try { overrides = JSON.parse(fs.readFileSync(namesFile, 'utf8')); }
  catch (e) { console.warn('! data/monster-names.json 解析失败，忽略映射：' + e.message); }
}

/* 文件名 → 固定 id（data/monster-ids.json）；调整显示顺序不影响成绩引用 */
let idsMap = {};
if (fs.existsSync(idsFile)) {
  try {
    const raw = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
    if (raw.ids) idsMap = raw.ids;
  } catch (e) { console.warn('! data/monster-ids.json 解析失败，将按顺序编号：' + e.message); }
}

let manifest = null;
if (fs.existsSync(orderFile)) {
  try {
    const raw = JSON.parse(fs.readFileSync(orderFile, 'utf8'));
    if (Array.isArray(raw.order)) manifest = raw.order;
  } catch (e) { console.warn('! data/monster-order.json 解析失败，将退化为文件名排序：' + e.message); }
}

const filesOnDisk = fs.readdirSync(imgDir).filter(f => IMG_RE.test(f));
const byName = new Map(filesOnDisk.map(f => [f, f]));

let order = [];
const warned = [];
if (manifest && manifest.length) {
  manifest.forEach((it) => {
    const file = typeof it === 'string' ? it : it.file;
    if (!byName.has(file)) {
      warned.push('清单中缺少图标（请放入 monsters/）：' + file);
      return;
    }
    order.push({ file, tier: (typeof it === 'string' ? '' : (it.tier || '')) });
    byName.delete(file);
  });
  byName.forEach((f) => { order.push({ file: f, tier: '' }); });
} else {
  const sorted = filesOnDisk.slice().sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase(), 'zh-Hans-CN', { numeric: true }));
  order = sorted.map(f => ({ file: f, tier: '' }));
  console.log('（未找到 data/monster-order.json，已按文件名排序生成）');
}

const entries = order.map((it, i) => {
  const stem = it.file.replace(/\.[^.]+$/, '');
  let name = overrides[it.file] || stem;
  const tier = it.tier ? `tier: '${it.tier}', ` : '';
  const fixed = (idsMap[it.file]) ? idsMap[it.file] : `m${String(i + 1).padStart(2, '0')}`;
  return `  { id: '${fixed}', file: '${it.file.replace(/'/g, "\\'")}', ${tier}name: '${name.replace(/'/g, "\\'")}' }`;
});

const header = `/* ============================================================
 * monsters.js — 怪物清单（由 tools/scan-monsters.js 自动生成）
 * 显示顺序与分组见 data/monster-order.json；改名/增删后请重跑
 *   node tools/scan-monsters.js
 * ============================================================ */
window.MHRS_MONSTERS = [
`;
const tail = `
];
`;

fs.writeFileSync(outFile, header + entries.join(',\n') + tail, 'utf8');
console.log(`完成：${order.length} 个怪物 → ${outFile}`);
warned.forEach(w => console.warn('! ' + w));
if (order.some(o => !o.tier)) {
  const noTier = order.filter(o => !o.tier).map(o => '   ' + o.file);
  console.log('提示：以下条目未标注 tier（显示在怪物列表最前/结尾的游离项，可忽略或补进 monster-order.json）：');
  noTier.forEach(l => console.log(l));
}
