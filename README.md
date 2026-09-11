# MHRSpeedrun · MHRS 竞速成绩库

> 《怪物猎人 崛起：曙光》中文竞速成绩数据库：任务 × 武器矩阵浏览、玩家时间线、投稿与人工审核发布。

[线上访问](https://absolute-balance.github.io/MHRSpeedrun/)

## 项目简介

- 以「任务 / 怪物 × 14 种武器」矩阵展示每个位置的**当前最快成绩**
- 三种赛道：**烈祸袭来**、**怪异探究 Lv300**、**特别探究**（EX1 ~ EX9）
- 点击成绩可查看视频与历史记录；点击作者可查看个人成绩时间线
- **访客可投稿**，管理员审核通过后才发布

## 主要功能

### 浏览与筛选

- 矩阵单格只显示该位置最快的一条成绩（时间 + 作者），颜色区分规则：**白色 = 三无规则，黄色 = TA 规则**
- **烈祸袭来**：固定 10 个任务作为横轴
- **怪异探究 Lv300 / 特别探究**：勾选 EX1 ~ EX9（可多选）后，对应怪物作为横轴，超过 10 个自动分页
- 筛选状态写入 URL，可直接分享当前视图

### 详情与玩家时间线

- 怪物页：全部武器的最快成绩
- 单武器页：当前题材成绩详情 + 历史记录
- 玩家页：按日期排列的个人成绩时间线

### 规则说明

- **📜 收录规则**弹窗：进入站点自动弹出一次（同一浏览器会话内关闭后不再打扰），随时可从顶部重新打开
- **⚠ 怪异探究任务规则**独立页面（非弹窗）：记录怪异探究任务存在的各类规则

## 投稿与审核

- **✉ 投稿成绩**（所有人）：任务类型 → 烈祸任务 或 EX 星级 → 怪物 → 武器 / 规则 / 用时 / 作者 / 日期 / 视频
- 视频仅收 B 站，支持完整链接或 BV 号自动补全；粘贴视频后可**自动识别标题**，回填任务类型、EX 星级、怪物、武器、用时、规则、日期与 UP 主
- 平台选项：**Steam / Nintendo Switch / PlayStation 4 / 5 / Xbox One / Xbox Series X|S**
- **⚖ 审核**（持审核口令者）：查看待审投稿 → 通过即发布（自动写入 `js/data.js` 并刷新资源版本号）/ 驳回

## 收录规则

1. 只收录国内玩家的成绩
2. 视频需要录制相对完整，最好展示到结算页
3. 视频需要展示配装和技能，并且需要合法
4. 只收录官方的合法任务（详情看怪异探究任务规则）
5. 使用影响局内 MOD 的成绩不收录（例如显血、七彩鬼火鸟MOD）
6. 有过“恶性老金”事迹玩家的成绩不收录
7. 未开伤害显示的视频不收录
8. 未展示结算页毫秒成绩的均以 99 替代毫秒数字

## 本地运行

```bash
git clone https://github.com/Absolute-Balance/MHRSpeedrun.git
cd MHRSpeedrun
node tools/serve.js          # 打开 http://127.0.0.1:8123
```

- 调整怪物顺序 / 增删怪物：编辑 `data/monster-order.json`，再运行 `node tools/scan-monsters.js` 生成 `js/monsters.js`
- 怪物固定 id 记录在 `data/monster-ids.json`，调整顺序不会造成成绩错位

## 技术架构

- **前端**：纯 HTML / CSS / JavaScript，GitHub Pages 托管，无构建步骤
- **投稿与审核后端**：Cloudflare Worker + KV（代码 `workers/worker.mjs`，部署步骤 `workers/DEPLOY.md`）
  - 接口：`POST /submit`（公开投稿）· `GET /pending`（待审列表）· `POST /approve`（通过并发布）· `POST /reject`（驳回）· `GET /testgh`（诊断）
- **管理员直录**：浏览器持有 GitHub 细粒度令牌（Contents 读写）时，可直接录入 / 修改 / 删除正式成绩
- **防缓存**：网页保存或审核发布时自动刷新 `index.html` 中的资源版本号

## 目录结构

```
index.html / css/ / js/       前端页面、样式与逻辑
data/                         怪物顺序（monster-order.json）、固定 id（monster-ids.json）
monsters/ weapons/            怪物与武器图标
workers/                      Cloudflare Worker 代码与部署文档
tools/                        本地预览服务（serve.js）、怪物表生成（scan-monsters.js）
开发纪要.md                    项目维护笔记
```

## 许可

成绩数据与收录内容归各投稿者所有；站点代码可自由参考使用，欢迎通过 Issue / PR 交流。
