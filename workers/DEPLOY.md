# MHRS 投稿审核后端 · 部署指南（Cloudflare Workers）

代码：`workers/worker.mjs`（复制全部内容粘贴到 Cloudflare Worker 即可，无需构建）。
前端启用：把 `js/config.js` 里 `submit.apiBase` 改成你的 Worker 地址后推送。

## 第 1 步：准备

1. 注册/登录 [Cloudflare](https://dash.cloudflare.com)（免费，无需实名）
2. GitHub 细粒度令牌（Contents 读写，可用你给页面保存用的那把；它只存进 Cloudflare 环境变量，不会发给浏览器）

## 第 2 步：创建 KV 存储（草稿区）

1. Cloudflare 左侧菜单 → **Workers & Pages** → **KV**
2. **Create a namespace** → 名称 `mhrs-submissions` → 创建

## 第 3 步：创建 Worker

1. **Workers & Pages** → **Create** → **Create Worker** → 名称填 `mhrs-api`（可自定义）→ Deploy
2. 进入该 Worker → **Edit code** → 全选默认代码删掉 → 把 `workers/worker.mjs` 的**全部内容**粘贴进去 → **Deploy**
3. 记下你的 Worker 地址：`https://mhrs-api.<你的子域>.workers.dev`（页面右上显示）

## 第 4 步：绑定 KV 与配置环境变量

Worker 页面 → **Settings** → **Variables**：

**KV Namespace Bindings**：Add binding → 变量名填 `SUBMISSIONS`，选 `mhrs-submissions` 命名空间 → Save

**Environment Variables**（逐个添加）：

| 变量 | 值 |
|---|---|
| `ADMIN_KEY` | 你自己生成的一长串随机口令（审核用，比如 32 位以上乱码） |
| `GITHUB_TOKEN` | `github_pat_…`（Contents 读写） |
| `GITHUB_OWNER` | `Absolute-Balance` |
| `GITHUB_REPO` | `MHRSpeedrun` |
| `GITHUB_BRANCH` | `main` |
| `ALLOWED_ORIGIN` | `https://absolute-balance.github.io,http://127.0.0.1:8123` |

保存后（改了环境变量通常需要重新 Deploy 一次才生效）。

## 第 5 步：接口测试（可选）

```
# 投稿
curl -X POST https://mhrs-api.<你的子域>.workers.dev/submit ^
 -H "Content-Type: application/json" ^
 -d "{\"questType\":\"special\",\"quest\":null,\"exStar\":\"EX9\",\"rule\":\"sanyou\",\"monsterId\":\"m57\",\"weaponId\":\"gs\",\"timeMs\":230820,\"author\":\"测试\",\"date\":\"2026-09-07\",\"title\":\"t\",\"bv\":\"BV1q5bp6AEaJ\",\"platform\":\"steam\",\"website\":\"\"}"

# 查待审（ADMIN_KEY 换成你的）
curl https://mhrs-api.<你的子域>.workers.dev/pending -H "x-admin-key: 你的口令"
```

## 第 6 步：前端启用

1. 改 `js/config.js`：
   ```js
   submit: { apiBase: 'https://mhrs-api.<你的子域>.workers.dev', adminKeyStorage: 'mhrs_admin_key' }
   ```
2. 提交推送，1~2 分钟后线上出现「✉ 投稿成绩」按钮
3. 你本人在浏览器里点「⚖ 审核」，第一次会询问审核口令（= ADMIN_KEY），填一次记住即可
4. 闭环验证：开无痕窗口投稿一条 → 普通窗口审核区看到 → 「✓ 通过并发布」→ 页面自动刷新，成绩进正式表

## 常用排查

- 页面提示“投稿服务尚未启用” → config.js `apiBase` 未改或未推送
- 返回 `无权限/401` → `x-admin-key` 与 `ADMIN_KEY` 不一致
- 返回跨域(CORS)报错 → `ALLOWED_ORIGIN` 没包含你当前打开的地址（含本地 127.0.0.1:8123）
- 审核通过报 GitHub 相关错误 → `GITHUB_TOKEN` 权限不足（需要 Contents 读写）或仓库名拼错
- 修改环境变量后请重新 Deploy 一次再测

## （可选）用 wrangler CLI 部署

```
npm i -g wrangler
wrangler login
# wrangler.toml
# name = "mhrs-api"
# main = "worker.mjs"
# compatibility_date = "2024-01-01"
# [[kv_namespaces]]
# binding = "SUBMISSIONS"
# id = "你的命名空间id"
# [vars]
# ADMIN_KEY="…"  GITHUB_TOKEN="…"  …
wrangler deploy
```
