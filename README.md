# MHRSpeedrun · MHRS 竞速成绩库

> 《怪物猎人 崛起：曙光》中文竞速成绩数据库。任务 × 武器矩阵浏览、玩家时间线、成绩投稿与人工审核发布。

[线上访问](https://absolute-balance.github.io/MHRSpeedrun/) · [B站 @星空柠檬凛](https://space.bilibili.com/35665642)

## 这是什么

面向 MHRS（崛起 + 曙光）竞速社群的开源成绩收录站：

- 以「任务/探究怪 × 14 武器」矩阵展示各位置**当前最快成绩**
- 支持 烈祸袭来 / 怪异探究Lv300 / 特别探究（EX1~EX9 + Apex 档）三种赛道
- 点击成绩可看视频、作者、历史记录；点击作者可看个人成绩时间线
- **访客可投稿**，管理员审核通过后发布，正式数据与草稿完全隔离

## 功能

- 矩阵浏览：烈祸袭来 10 任务 / EX 星级 → 对应怪物 × 14 武器，单格只显示最快成绩
- 详情页：当前记录 + 历史记录（视频/作者/日期/平台）
- 玩家页：按日期排列的个人成绩时间线
- 投稿与审核：`✉ 投稿成绩`（所有人）→ 审核区（管理员）→ 一键发布
- 管理工具：管理员可直接录入 / 修改 / 删除成绩（GitHub 令牌）
- 表格导出 PNG、白天/夜晚主题、收录规则说明、URL 状态分享

## 规则约定

- 赛道：三无规则、TA 规则（无限制赛道已按站规移除）
- 时间格式：`分'秒''百分秒`（如 `05'02''52`）；未展示毫秒的默认按 `99` 计
- 视频：仅收 B 站（链接或 BV 号均可，自动补全）
- 收录细则见页面「📜 收录规则」

## 快速开始（投稿）

1. 打开站点 → 点击 **✉ 投稿成绩**
2. 依次选择：任务类型 → 烈祸任务 / EX 星级 → 怪物（列表随前两项自动过滤）
3. 填写武器、规则、用时、作者、日期、视频链接后提交
4. 管理员在 **⚖ 审核** 中通过后即发布

## 本地开发

```bash
git clone https://github.com/Absolute-Balance/MHRSpeedrun.git
cd MHRSpeedrun
node tools/serve.js          # 打开 http://127.0.0.1:8123
```

数据文件：`js/data.js`（window.MHRS_RECORDS）；怪物映射由 `data/monster-order.json` + `tools/scan-monsters.js` 生成。

## 技术栈

- 前端：纯 HTML/CSS/JS（GitHub Pages 托管，无构建步骤）
- 投稿/审核后端：Cloudflare Worker + KV（见 `workers/DEPLOY.md`）
- 数据：Git 仓库内 `js/data.js`，每次发布即一次 commit（天然版本化、可回滚）

## 目录

```
index.html / css/ / js/       前端
data/                         monster-order.json（顺序）、monster-ids.json（稳定 id）
workers/                      Cloudflare Worker + 部署文档
tools/                        scan-monsters.js / serve.js
开发纪要.md                   项目维护笔记
```

## License

数据与收录内容归贡献者所有；站点代码可按 MHRS 社区惯例自由使用（欢迎 PR）。
