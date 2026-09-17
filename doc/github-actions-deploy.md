# GitHub Actions 自动部署说明

推送代码到 `main` 分支（改动 `mail-worker/**` 或 `mail-vue/**`）后，会自动构建并部署到 Cloudflare Workers。也可在 GitHub Actions 页面手动点击 **Run workflow**。

## 1. 恢复 / 确认文件

仓库需包含：

- `.github/workflows/deploy-cloudflare.yml`
- `mail-worker/wrangler-action.toml`
- `mail-worker/scripts/cf-deploy.mjs`（Cloudflare Workers Builds 用）

## 2. 多仓库注意：D1 / KV ID 按仓库隔离

**不要把 D1 / KV ID 写进代码。** 每个 GitHub 仓库（或每个 Cloudflare 项目）使用自己的一套：

| 仓库示例 | Secrets 里各自填写 |
|----------|-------------------|
| `mail-330` | 该环境的 `D1_DATABASE_ID`、`KV_NAMESPACE_ID`、`NAME=mail-330` |
| `H` | 另一套 `D1_DATABASE_ID`、`KV_NAMESPACE_ID`、`NAME=...` |

同一 Cloudflare 账号下也可以有多套 D1/KV，只要 Secrets 不混用即可。

## 3. 配置 GitHub Secrets / Variables

打开**对应仓库**：**Settings → Secrets and variables → Actions**

### 必填

| 名称 | 说明 | 示例 |
|------|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需 Workers / D1 / KV / R2 权限） | `xxxxx` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID | `xxxxxxxx` |
| `DOMAIN` | 邮件域名，**必须是 JSON 数组字符串** | `["mail330.fj-h.online"]` |
| `ADMIN` | 管理员邮箱 | `admin@mail330.fj-h.online` |
| `JWT_SECRET` | JWT 密钥（勿含 `? % # / \`） | 一串随机字符串 |
| `CUSTOM_DOMAIN` | 自定义访问域名 | `mail-330.fj-h.online` |

### 强烈建议（已有线上数据时必填）

| 名称 | 说明 |
|------|------|
| `D1_DATABASE_ID` | **本仓库**对应的 D1 UUID |
| `KV_NAMESPACE_ID` | **本仓库**对应的 KV ID |
| `NAME` | Worker / 资源名前缀，建议与项目一致，如 `mail-330` |
| `R2_BUCKET_NAME` | R2 桶名（不填则去掉 R2 绑定） |

未设置 `D1_DATABASE_ID` / `KV_NAMESPACE_ID` 时，会按 `NAME`（默认 `cloud-mail`）自动查找或新建资源——**不同仓库请设置不同的 `NAME`，避免互相抢同一套库。**

### 可选

| 名称 | 说明 | 默认 |
|------|------|------|
| `NAME` | Worker / 资源名称 | `cloud-mail` |
| `AI_MODEL` | Workers AI 模型 | `@cf/meta/llama-3.1-8b-instruct-fast` |
| `CF_EMAIL` | 是否启用 Cloudflare Email Sending，填 `true` | `false` |
| `ANALYSIS_CACHE` | 是否开启分析缓存 | `false` |
| `PROJECT_LINK` | 项目外链 | 空 |

## 4. Cloudflare Workers Builds（控制台 Git 部署）

1. Deploy command 改为：`pnpm run deploy`（根目录 `mail-worker`）
2. 在该项目的 **Environment variables** 中填写**本项目**的：
   - `D1_DATABASE_ID`
   - `KV_NAMESPACE_ID`
   - `NAME`（可选，建议与 Worker 名一致）

## 5. 创建 Cloudflare API Token

1. 打开 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token** → 可用 **Edit Cloudflare Workers** 模板
3. 确保包含：Account → Workers Scripts、D1、Workers KV Storage、R2（如需要）的编辑权限
4. 创建后复制 Token 到 GitHub Secret：`CLOUDFLARE_API_TOKEN`

Account ID 在 Cloudflare 仪表盘右侧 / Workers 概览页。

## 6. 触发部署

```bash
git add .
git commit -m "chore: trigger deploy"
git push origin main
```

或在 GitHub → **Actions** → **Deploy cloud-mail to Cloudflare Workers** → **Run workflow**。

## 7. 验证

- Actions 日志显示 Deploy / Initialize database 成功
- 打开 `https://你的域名` 能正常访问
- 若首次部署，workflow 会请求 `/api/init/${JWT_SECRET}` 初始化数据库

## 注意

1. **换仓库不要复用另一仓库的 D1/KV ID**，否则会串数据或报 namespace not found。
2. 本地：`cd mail-worker && D1_DATABASE_ID=... KV_NAMESPACE_ID=... NAME=mail-330 pnpm deploy`
3. `DOMAIN` 必须是合法 JSON 数组，例如：`["example.com"]`。
