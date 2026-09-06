# MHRS 竞速成绩库（怪物猎人 崛起：曙光 · Speedrun DB）

纯静态网页 + JS 数据文件。**任务/EX × 武器成绩矩阵**为主界面；每个位置只展示最新最快的一条成绩。

## 快速开始

- 直接双击 `index.html`，或 `node tools/serve.js` → http://127.0.0.1:8123

## 上线到 GitHub Pages（让别人能访问）

1. 注册/登录 [github.com](https://github.com)，右上角 **+ → New repository**：仓库名建议 `mhrspeedrun`，**选 Public**（免费 Pages 要求公开仓库），不要勾选任何初始化文件（README 等都不勾，本地已有）
2. 创建后按页面提示在本地执行（git 已初始化并提交过）：
   ```
   git remote add origin https://github.com/你的用户名/mhrspeedrun.git
   git push -u origin master
   ```
   （首次推送会弹浏览器登录 GitHub 授权一次）
3. 回到仓库页面 **Settings → Pages**：Source 选 **Deploy from a branch**，Branch 选 **master / (root)**，Save
4. 等 1~2 分钟，访问 `https://你的用户名.github.io/mhrspeedrun/` 即上线

以后更新成绩：改完 `js/data.js` 等文件后
```
git add -A
git commit -m "更新成绩"
git push
```
等一两分钟自动生效（或先看自己机器上的预览效果再推）。

> GitHub 学生认证（Student Developer Pack）后可额外获得：免费 `.me` 域名 + GitHub Pro（私有仓库也能开 Pages + 更多 Actions 额度）。普通免费账号用公开仓库即可，无需学生认证。
> 换自定义域名：仓库 Settings → Pages → Custom domain 填入你的域名，并按提示到域名服务商加一条 CNAME 记录指向 `你的用户名.github.io`（见上文“数据迁移”说明，换域名不丢数据）。

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
3. **表格格**：每格只显示该位置「最快」的一条 —— 时间 + 作者；时间颜色区分规则：**白色=三无规则、黄色=TA规则、红色=无限制规则**；该位置还有旧成绩时格角显示「历史 n」
4. **点怪物头像** → 怪物页：14 种武器各自的最快成绩一览
5. **点成绩格** → 单武器页：该位置（怪物×武器×任务）当前记录大卡（视频/作者/日期/平台）+ 历史记录列表（可展开看详情）
6. **点作者名** → 玩家页：该玩家全部成绩按日期时间线（可展开视频）

## 成绩收录规则

主页「📜 收录规则」按钮查看：只收录录制相对完整的片；只录国内玩家；未展示装备技能、不合法炼化、使用影响局内 MOD、未开伤害显示、恶性老金玩家的片不录入。

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
  timeMs: 272640,            // 03'34''40（分'秒''百分秒）换算毫秒
  author: 'BFeather7',
  date: '2026-09-06',
  videos: [{ site: 'bilibili', url: 'https://www.bilibili.com/video/BV1q5bp6AEaJ', title: '' }],
  platform: 'steam',          // steam | switch | ps5
  note: ''
}
```

> 同位置的历史成绩保留在数组中即可：表格只显示最快一条，单武器页自动把其他条归入「历史记录」。页面所有用时统一显示为 `05'02''52` 这种 分'秒''百分秒 形式。

## 录成绩

页面「＋录入成绩」，每行 CSV：`怪物,武器,任务类型,EX或任务,规则,用时,作者,日期,视频[,备注]`

```
白兔兽, 双剑, 特别探究, EX1, TA规则, 04'32''64, BFeather7, 2026-09-06, https://www.bilibili.com/video/BV1q5bp6AEaJ
霸主·雷狼龙, 剑斧, 怪异探究Lv300, Apex, 无限制规则, 10'21''66, 玩家X, 2026-08-01, https://…
```

校验后「下载 data.js 覆盖 js/data.js」或填入 GitHub 令牌后「💾 保存到 GitHub」直接更新线上（霸主名带不带 · 都能识别，中英文逗号均可）。

## 已知演示/待办

- `js/data.js`：`real-001/002/003/004`（BFeather7）、`real-005`（鬼畜茶走）为真实成绩；其余 demo-* 为演示数据，正式使用前请清理（说一声我也可以代删）
- 平台字段现为 steam / switch / ps5 三档；个别成绩若平台有误直接改数据即可
- 后续可按需做：格子内直接编辑/删成绩、按月份统计、图鉴浏览入口
