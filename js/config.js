/* ============================================================
 * config.js — 站点全局配置
 * 想改任务类型 / EX 星级 / 烈祸任务列表 / 狩猎规则 / 武器名单，
 * 只需要改这里，页面会自动按新配置渲染。
 * ============================================================ */
window.MHRS_CONFIG = {
  siteTitle: 'MHRS 竞速成绩库',
  siteSubtitle: '怪物猎人 崛起：曙光 · Speedrun 成绩数据库',

  /* ---- 任务类型（单选，页面按它切换矩阵轴向）----
   * raging    烈祸袭来：横轴固定为下方 ragingQuests 的 10 个任务
   * anomaly300 怪异探究 Lv300 / special 特别探究：
   *            选 EX1~EX9 后，横轴显示对应 EX 等级的怪物
   * ---------------------------------------------- */
  questTypes: [
    { id: 'raging',     label: '烈祸袭来' },
    { id: 'anomaly300', label: '怪异探究 Lv300' },
    { id: 'special',    label: '特别探究' }
  ],

  /* ---- 烈祸袭来任务（固定横轴，10 个）----
   * id          成绩记录 quest 字段存它（q01~q10）
   * label       任务全名（悬停/详情显示）
   * shortLabel  横轴下的短名
   * monsterFile 目标怪物图标（必须是 monsters/ 目录里的文件名）
   * ---------------------------------------------- */
  ragingQuests: [
    { id: 'q01', label: '烈祸袭来：朦胧之影',     shortLabel: '朦胧之影',     monsterFile: '月迅龙.png' },
    { id: 'q02', label: '烈祸袭来：舞于火海的浩劫', shortLabel: '舞于火海的浩劫', monsterFile: '焰狐龙.png' },
    { id: 'q03', label: '烈祸袭来：传奇一击',     shortLabel: '传奇一击',     monsterFile: '棘茶龙.png' },
    { id: 'q04', label: '烈祸袭来：狮子迷人的肉体', shortLabel: '狮子迷人的肉体', monsterFile: '金狮子.png' },
    { id: 'q05', label: '烈祸袭来：奏响毁灭的旋律', shortLabel: '奏响毁灭的旋律', monsterFile: '岚龙.png' },
    { id: 'q06', label: '烈祸袭来：超速电导',     shortLabel: '超速电导',     monsterFile: '雷狼龙.png' },
    { id: 'q07', label: '烈祸袭来：雪花纷飞',     shortLabel: '雪花纷飞',     monsterFile: '冰龙.png' },
    { id: 'q08', label: '烈祸袭来：原初异音！',   shortLabel: '原初异音！',   monsterFile: '原初形态爵银龙.png' },
    { id: 'q09', label: '烈祸袭来：刚缠巨响！',   shortLabel: '刚缠巨响！',   monsterFile: '刚缠兽.png' },
    { id: 'q10', label: '烈祸袭来：冰狼长嚎！',   shortLabel: '冰狼长嚎！',   monsterFile: '冰狼龙.png' }
  ],

  /* ---- EX 星级（多选按钮，怪异探究Lv300/特别探究时显示）----
   * EX1~EX9 为常规星级；Apex（霸主 6 只，mod 探究任务）作为半独立档排在 EX9 之后
   * ---------------------------------------------- */
  exStars: ['EX1', 'EX2', 'EX3', 'EX4', 'EX5', 'EX6', 'EX7', 'EX8', 'EX9', 'Apex'],

  /* ---- 狩猎规则（单选；默认“全部”） ---- */
  rules: [
    { id: 'sanyou', label: '三无规则' },
    { id: 'ta',     label: 'TA规则' },
    { id: 'free',   label: '无限制规则' }
  ],

  /* ---- 14 种武器（矩阵纵轴；file 指向 weapons/ 下的图标文件） ---- */
  weapons: [
    { id: 'gs',     label: '大剑',   file: '大剑.png' },
    { id: 'ls',     label: '太刀',   file: '太刀.png' },
    { id: 'sns',    label: '单手剑', file: '单手剑.png' },
    { id: 'db',     label: '双剑',   file: '双剑.png' },
    { id: 'hammer', label: '大锤',   file: '大锤.png' },
    { id: 'hh',     label: '狩猎笛', file: '狩猎笛.png' },
    { id: 'lance',  label: '长枪',   file: '长枪.png' },
    { id: 'gl',     label: '铳枪',   file: '铳枪.png' },
    { id: 'sa',     label: '剑斧',   file: '剑斧.png' },
    { id: 'cb',     label: '盾斧',   file: '盾斧.png' },
    { id: 'ig',     label: '操虫棍', file: '操虫棍.png' },
    { id: 'lbg',    label: '轻弩炮', file: '轻弩炮.png' },
    { id: 'hbg',    label: '重弩炮', file: '重弩炮.png' },
    { id: 'bow',    label: '弓',     file: '弓.png' }
  ],

  /* ---- 平台（成绩可选字段，可后续扩展） ---- */
  platforms: [
    { id: 'steam',  label: 'Steam' },
    { id: 'switch', label: 'Nintendo Switch' },
    { id: 'ps5',    label: 'PS5' }
  ],

  /* ---- 图标目录（相对 index.html） ---- */
  weaponIconDir: 'weapons',
  monsterIconDir: 'monsters',

  /* ---- 矩阵横轴每页最多显示的数量 ---- */
  axisPageSize: 10,

  /* ---- GitHub 仓库信息（网页内直接保存成绩回仓库用） ---- */
  github: {
    owner: 'Absolute-Balance',
    repo: 'MHRSpeedrun',
    branch: 'main',
    dataPath: 'js/data.js'
  }
};
