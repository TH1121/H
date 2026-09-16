# GitHub Actions 自动部署说明

推送代码到 `main` 分支（改动 `mail-worker/**` 或 `mail-vue/**`）后，会自动构建并部署到 Cloudflare Workers。也可在 GitHub Actions 页面手动点击 **Run workflow**。

## 1. 恢复 / 确认文件

仓库需包含：

- `.github/workflows/deploy-cloudflare.yml`
- `mail-worker/wrangler-action.toml`

## 2. 配置 GitHub Secrets / Variables

打开仓库：**Settings → Secrets and variables → Actions**

建议敏感信息放 **Secrets**，非敏感放 **Variables**。

### 必填（线上已有库时尤其重要）

| 名称 | 说明 | 示例 |
|------|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需 Workers / D1 / KV / R2 权限） | `xxxxx` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID | `xxxxxxxx` |
| `DOMAIN` | 邮件域名，**必须是 JSON 数组字符串** | `["mail330.fj-h.online"]` |
| `ADMIN` | 管理员邮箱 | `admin@mail330.fj-h.online` |
| `JWT_SECRET` | JWT 密钥（勿含 `? % # / \`） | 一串随机字符串 |
| `D1_DATABASE_ID` | **已有** D1 UUID（必填，禁止每次新建） | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `KV_NAMESPACE_ID` | **已有** KV ID（必填，禁止每次新建） | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `CUSTOM_DOMAIN` | 自定义访问域名 | `mail-330.fj-h.online` |

### 强烈建议

| 名称 | 说明 |
|------|------|
| `R2_BUCKET_NAME` | R2 桶名（不填则去掉 R2 绑定） |

> 未设置 `D1_DATABASE_ID` / `KV_NAMESPACE_ID` 时，Actions **会直接失败**，避免误绑空库。
> 在 Cloudflare 控制台 → Workers → D1 / KV 复制现有资源 ID 填入即可。

### 可选

| 名称 | 说明 | 默认 |
|------|------|------|
| `NAME` | Worker / 资源名称 | `cloud-mail` |
| `AI_MODEL` | Workers AI 模型 | `@cf/meta/llama-3.1-8b-instruct-fast` |
| `CF_EMAIL` | 是否启用 Cloudflare Email Sending，填 `true` | `false` |
| `ANALYSIS_CACHE` | 是否开启分析缓存 | `false` |
| `PROJECT_LINK` | 项目外链 | 空 |

## 3. 创建 Cloudflare API Token

1. 打开 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token** → 可用 **Edit Cloudflare Workers** 模板
3. 确保包含：Account → Workers Scripts、D1、Workers KV Storage、R2（如需要）的编辑权限
4. 创建后复制 Token 到 GitHub Secret：`CLOUDFLARE_API_TOKEN`

Account ID 在 Cloudflare 仪表盘右侧 / Workers 概览页。

## 4. 触发部署

```bash
git add .
git commit -m "feat: restore auto deploy workflow"
git push origin main
```

或在 GitHub → **Actions** → **Deploy cloud-mail to Cloudflare Workers** → **Run workflow**。

## 5. 验证

- Actions 日志显示 Deploy / Initialize database 成功
- 打开 `https://你的域名` 能正常访问
- 若首次部署，workflow 会请求 `/api/init/${JWT_SECRET}` 初始化数据库

## 注意

1. **每次部署丢 D1/KV 绑定**：通常是没在 Secrets 写死 `D1_DATABASE_ID` / `KV_NAMESPACE_ID`，或本地 `wrangler.toml` 里 `database_id` / `id` 为空。部署配置是绑定的唯一来源，空配置会覆盖控制台里的绑定。
2. 本地手动部署前，请在 [`mail-worker/wrangler.toml`](../mail-worker/wrangler.toml) 填入同一套 D1/KV ID。
3. `DOMAIN` 必须是合法 JSON 数组，例如：`["example.com"]`，不要写成 `example.com`。
4. 本地改完后若不想走 CI，可：`cd mail-worker && pnpm deploy`（同样依赖 `wrangler.toml` 里的绑定）。
