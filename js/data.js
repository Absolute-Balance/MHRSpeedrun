/* ============================================================
 * data.js — 成绩数据
 *
 * 约定：每个“位置”（怪物 × 任务/EX × 武器）通常只维护一条
 * 最新最快的成绩作为当前记录；旧成绩可保留在本数组中作为
 * 历史记录（矩阵格子只显示最快一条，点击格子可看该武器历史）。
 *
 * 字段说明：
 *   id          唯一编号（建议 r001, r002 …）
 *   questType   任务类型: 'raging'烈祸袭来 | 'anomaly300'怪异探究Lv300 | 'special'特别探究
 *   quest       仅烈祸袭来: 对应 js/config.js ragingQuests 的 id（q01~q10）
 *   exStar      仅怪异探究Lv300/特别探究: 'EX1'~'EX9' 或 'Apex'（霸主档）
 *   rule        狩猎规则: 'sanyou'三无 | 'ta'TA规则 | 'free'无限制
 *   monsterId   怪物 id（见 js/monsters.js，m01~m68）
 *   weaponId    武器 id（见 js/config.js，如 'ls' 太刀、'db' 双剑）
 *   timeMs      用时（毫秒）；显示自动格式化为 分:秒.百分秒
 *   author      作者
 *   date        成绩日期 'YYYY-MM-DD'
 *   videos      视频链接数组：[{site, url, title}]  site: 'bilibili'|'youtube'|'other'
 *   platform    平台（可选）: 'steam' | 'switch' | 'ps5'（标签见 config.js platforms）
 *   note        备注（可选）
 * ============================================================ */
window.MHRS_RECORDS = [

  /* ---- 真实成绩示例（BFeather7）---- */
  {
    id: 'real-001', questType: 'special', quest: null, exStar: 'EX1',
    rule: 'ta', monsterId: 'm06', weaponId: 'db', timeMs: 272640,
    author: 'BFeather7', date: '2026-09-06',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1q5bp6AEaJ', title: '双剑 特别探究 白兔兽 4:32.64' }],
    platform: 'steam', note: '玩家提供：真实成绩'
  },

  /* ---- 真实成绩示例 2（BFeather7 · 怪异克服天彗龙 三无 双剑）----
   * real-002 为当前最新记录，real-003/004 为其历史记录示例 */
  {
    id: 'real-002', questType: 'special', quest: null, exStar: 'EX9',
    rule: 'sanyou', monsterId: 'm57', weaponId: 'db', timeMs: 214400,
    author: 'BFeather7', date: '2026-01-03',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1tMiqBuET8', title: '双剑 特别探究 怪异克服天彗龙 3:34.40' }],
    platform: 'steam', note: ''
  },
  {
    id: 'real-003', questType: 'special', quest: null, exStar: 'EX9',
    rule: 'sanyou', monsterId: 'm57', weaponId: 'db', timeMs: 229890,
    author: 'BFeather7', date: '2025-10-24',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1zXspzkEGu', title: '双剑 特别探究 怪异克服天彗龙 3:49.89' }],
    platform: 'steam', note: '历史记录：3\'49"89'
  },
  {
    id: 'real-004', questType: 'special', quest: null, exStar: 'EX9',
    rule: 'sanyou', monsterId: 'm57', weaponId: 'db', timeMs: 235150,
    author: 'BFeather7', date: '2024-12-16',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1kCzUYLEw9', title: '双剑 特别探究 怪异克服天彗龙 3:55.15' }],
    platform: 'steam', note: '历史记录：3\'55"15'
  },

  /* ---- 真实成绩示例 3（鬼畜茶走 · 雪鬼兽 三无 大剑）---- */
  {
    id: 'real-005', questType: 'special', quest: null, exStar: 'EX4',
    rule: 'sanyou', monsterId: 'm30', weaponId: 'gs', timeMs: 417520,
    author: '鬼畜茶走', date: '2026-08-29',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1Zv4C6HEPx', title: '6分台达成 流斩大剑 特别探究：雪鬼兽 6\'57\'\'52 三无规则' }],
    platform: 'steam', note: ''
  },

  /* ---- 以下为演示/示例数据，正式使用前请删除或替换 ---- */
  {
    id: 'demo-001', questType: 'raging', quest: 'q01', exStar: null,
    rule: 'ta', monsterId: 'm58', weaponId: 'ls', timeMs: 296330,
    author: '示例玩家·阿玄', date: '2025-01-02',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00001', title: '示例：太刀 朦胧之影 04:56.33' }],
    platform: 'steam', note: '这是演示数据，请删除或替换。'
  },
  {
    id: 'demo-002', questType: 'raging', quest: 'q01', exStar: null,
    rule: 'ta', monsterId: 'm58', weaponId: 'ls', timeMs: 305020,
    author: '示例玩家·苍蓝', date: '2024-12-28',
    videos: [{ site: 'youtube', url: 'https://www.youtube.com/watch?v=DEMO000002', title: '示例：05:05.02' }],
    platform: 'switch', note: '历史记录示例（比当前慢，作为旧成绩保留）'
  },
  {
    id: 'demo-003', questType: 'raging', quest: 'q01', exStar: null,
    rule: 'ta', monsterId: 'm58', weaponId: 'ls', timeMs: 312880,
    author: '示例玩家·赤羽', date: '2025-01-05',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00003', title: '' }],
    platform: 'steam', note: '历史记录示例'
  },
  {
    id: 'demo-004', questType: 'raging', quest: 'q04', exStar: null,
    rule: 'free', monsterId: 'm44', weaponId: 'gs', timeMs: 344330,
    author: '示例玩家·大剑师', date: '2024-12-30',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00004', title: '' }],
    platform: 'steam', note: ''
  },
  {
    id: 'demo-005', questType: 'raging', quest: 'q07', exStar: null,
    rule: 'free', monsterId: 'm61', weaponId: 'lbg', timeMs: 418410,
    author: '示例玩家·弹幕', date: '2025-01-06',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00005', title: '示例：轻弩 雪花纷飞' }],
    platform: 'steam', note: ''
  },
  {
    id: 'demo-006', questType: 'anomaly300', quest: null, exStar: 'EX9',
    rule: 'ta', monsterId: 'm57', weaponId: 'db', timeMs: 451250,
    author: '示例玩家·双刀客', date: '2025-01-07',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00006', title: '示例：双剑 怪异探究Lv300 EX9' }],
    platform: 'steam', note: ''
  },
  {
    id: 'demo-007', questType: 'special', quest: null, exStar: 'EX9',
    rule: 'free', monsterId: 'm57', weaponId: 'bow', timeMs: 478020,
    author: '示例玩家·月弓', date: '2025-01-01',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00007', title: '示例：弓 特别探究EX9' },
             { site: 'youtube', url: 'https://www.youtube.com/watch?v=DEMO000007', title: '镜像' }],
    platform: 'steam', note: '多视频链接示例（B站+YouTube 镜像）。'
  },
  {
    id: 'demo-008', questType: 'special', quest: null, exStar: 'EX9',
    rule: 'ta', monsterId: 'm56', weaponId: 'ls', timeMs: 492440,
    author: '示例玩家·阿玄', date: '2024-12-20',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00008', title: '' }],
    platform: 'steam', note: ''
  },
  {
    id: 'demo-009', questType: 'special', quest: null, exStar: 'EX7',
    rule: 'ta', monsterId: 'm51', weaponId: 'hh', timeMs: 543180,
    author: '示例玩家·笛手', date: '2024-12-12',
    videos: [{ site: 'youtube', url: 'https://www.youtube.com/watch?v=DEMO000009', title: '' }],
    platform: 'switch', note: ''
  },
  {
    id: 'demo-010', questType: 'special', quest: null, exStar: 'EX5',
    rule: 'sanyou', monsterId: 'm36', weaponId: 'ig', timeMs: 462880,
    author: '示例玩家·斩击', date: '2025-01-08',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00010', title: '' }],
    platform: 'steam', note: ''
  },
  {
    id: 'demo-011', questType: 'special', quest: null, exStar: 'EX2',
    rule: 'ta', monsterId: 'm10', weaponId: 'lance', timeMs: 513150,
    author: '示例玩家·长枪客', date: '2024-12-19',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00011', title: '' }],
    platform: 'steam', note: ''
  },
  {
    id: 'demo-012', questType: 'anomaly300', quest: null, exStar: 'EX9',
    rule: 'free', monsterId: 'm56', weaponId: 'gs', timeMs: 485310,
    author: '示例玩家·大剑师', date: '2025-01-09',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00012', title: '' }],
    platform: 'steam', note: ''
  },
  {
    id: 'demo-013', questType: 'special', quest: null, exStar: 'Apex',
    rule: 'free', monsterId: 'm68', weaponId: 'sa', timeMs: 621660,
    author: '示例玩家·斩击', date: '2026-08-20',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00013', title: '' }],
    platform: 'steam', note: '霸主档（mod 探究任务）演示'
  },
  {
    id: 'demo-014', questType: 'anomaly300', quest: null, exStar: 'Apex',
    rule: 'ta', monsterId: 'm63', weaponId: 'db', timeMs: 388100,
    author: '示例玩家·双刀客', date: '2026-09-01',
    videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1DEMO00014', title: '' }],
    platform: 'switch', note: '霸主档 mod 任务演示（怪异探究Lv300）'
  }
];
