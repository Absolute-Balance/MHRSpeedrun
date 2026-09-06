# MHRS 竞速成绩库（怪物猎人 崛起：曙光 · Speedrun DB）

纯静态网页 + JS 数据文件。**任务/EX × 武器成绩矩阵**为主界面；每个位置只展示最新最快的一条成绩。

## 快速开始

- 直接双击 `index.html`，或 `node tools/serve.js` → http://127.0.0.1:8123

## 目录结构

```
mhrspeedrun/
├─ index.html / css/style.css / README.md
├─ js/
│  ├─ config.js          任务类型 / 烈祸任务 / EX含Apex / 规则 / 武器
│  ├─ monsters.js        68 只怪物（★由脚本生成）
│  ├─ data.js            成绩数据（★日常维护；real-001 为真实成绩示例）
│  └─ app.js             矩阵 + 怪物页 + 单武器页
├─ weapons/  monsters/   图标（中文文件名）
├─ data/
│  ├─ monster-order.json     显示顺序 + 星级分组（EX1~EX9 / Apex / raging）
│  └─ monster-names.json     显示名映射（如 霸主青熊兽.png → 霸主·青熊兽）
└─ tools/serve.js  scan-monsters.js
```

## 使用流程

1. **选任务类型**：
   - **烈祸袭来** → 横轴 = 10 个固定任务（任务短名 + 目标怪图标）
   - **怪异探究Lv300 / 特别探究** → 出现 EX1~EX9 + **Apex** 多选；横轴 = 对应怪
2. **选狩猎规则**（可不限）；横轴超过 10 自动分页
3. **矩阵格**：每格只显示该位置「最新最快」的一条 —— 时间 + 作者；TA 规则时间显示**黄色**，其他规则**白色**；该位置还有旧成绩时格角显示「历史 n」
4. **点怪物头像** → 怪物页：14 种武器各自的最快成绩一览
5. **点成绩格** → 单武器页：该位置（怪物×武器×任务）当前记录大卡（视频/作者/日期/平台/备注）+ 历史记录列表（可展开看详情）

## 怪物体系（68 只）

- EX1~EX9：57 只（怪异克服系在 EX8/EX9）
- **Apex：6 只霸主**（霸主·青熊兽/雌火龙/火龙/泡狐龙/角龙/雷狼龙）—— 半独立档排在 EX9 后；mod 探究任务，同时区分怪异探究Lv300 与 特别探究（记录 exStar = 'Apex'）
- 烈祸袭来独有：月迅龙/焰狐龙/岚龙/冰龙/原初形态爵银龙

顺序/分组改 `data/monster-order.json`，改名映射改 `data/monster-names.json`，之后运行 `node tools/scan-monsters.js`。

## 烈祸袭来 10 任务（config.js → ragingQuests）

q01 朦胧之影=月迅龙 · q02 舞于火海的浩劫=焰狐龙 · q03 传奇一击=棘茶龙 · q04 狮子迷人的肉体=金狮子 · q05 奏响毁灭的旋律=岚龙 · q06 超速电导=雷狼龙 · q07 雪花纷飞=冰龙 · q08 原初异音！=原初形态爵银龙 · q09 刚缠巨响！=刚缠兽 · q10 冰狼长嚎！=冰狼龙

## 成绩字段（js/data.js）

```js
{
  id: 'r001',
  questType: 'special',      // raging | anomaly300 | special
  quest: null,               // 仅烈祸袭来: q01~q10
  exStar: 'EX1',             // 仅探究类: 'EX1'~'EX9' 或 'Apex'
  rule: 'ta',                // sanyou | ta | free（ta 的时间显示黄色）
  monsterId: 'm06',          // 白兔兽
  weaponId: 'db',            // 双剑
  timeMs: 272640,            // 4:32.64
  author: 'BFeather7',
  date: '2026-09-06',
  videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1q5bp6AEaJ', title: '' }],
  platform: 'pc',
  note: ''
}
```

> 同位置的历史成绩保留在数组中即可：矩阵只显示最快一条，单武器页自动把其他条归入「历史记录」。

## 录成绩

页面「＋录入成绩」，每行 CSV：`怪物,武器,任务类型,EX或任务,规则,用时,作者,日期,视频[,备注]`

```
白兔兽, 双剑, 特别探究, EX1, TA规则, 4:32.64, BFeather7, 2026-09-06, https://www.bilibili.com/video/BV1q5bp6AEaJ
霸主·雷狼龙, 剑斧, 怪异探究Lv300, Apex, 无限制, 10:21.66, 玩家X, 2026-08-01, https://…
```

校验后下载 data.js 覆盖 `js/data.js` 即可（霸主名带不带 · 都能识别）。

## 已知演示/待办

- `js/data.js`：`real-001` 为 BFeather7 真实成绩；其余 demo-* 为演示数据，正式使用前请清理（说一声我也可以代删）
- BFeather7 记录的规则暂记 TA、平台暂记 pc —— 如需修改告诉我或直接改 data.js 两个字段
- 后续可按需做：格子内直接编辑/删成绩、按月份统计、图鉴浏览入口
