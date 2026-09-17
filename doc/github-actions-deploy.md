# 多仓库部署说明（两套 wrangler 配置）

同一套代码可以推到多个仓库，用**不同配置文件**区分 D1 / KV：

| 仓库 / 项目 | 配置文件 | Cloudflare Deploy command |
|-------------|----------|---------------------------|
| `mail-330` | [`mail-worker/wrangler.mail-330.toml`](../mail-worker/wrangler.mail-330.toml) | `npx wrangler deploy -c wrangler.mail-330.toml` |
| `H` | [`mail-worker/wrangler.h.toml`](../mail-worker/wrangler.h.toml) | `npx wrangler deploy -c wrangler.h.toml` |

本地：

```bash
cd mail-worker
pnpm run deploy:mail-330   # 或 pnpm deploy
pnpm run deploy:h
```

## 你需要做的

### mail-330（已写入当前 ID）

1. Cloudflare 项目 **mail-330** → 设置 → 构建  
2. **Deploy command** 改成：  
   `npx wrangler deploy -c wrangler.mail-330.toml`  
3. 根目录选 `mail-worker`  
4. 重新部署  

若 KV 仍报 not found，到 Cloudflare → KV 确认 ID，或新建后改 `wrangler.mail-330.toml` 里的 `id`。

### H 仓库

1. 编辑 `mail-worker/wrangler.h.toml`，把：  
   - `database_id = "REPLACE_WITH_H_D1_UUID"`  
   - `id = "REPLACE_WITH_H_KV_ID"`  
   换成 H 自己的 D1 / KV ID  
2. Cloudflare 对应项目 Deploy command：  
   `npx wrangler deploy -c wrangler.h.toml`  
3. 推送并部署  

## GitHub Actions（可选）

若走 Actions，继续用 Secrets 注入的 `wrangler-action.toml`；每个仓库填**自己的** `D1_DATABASE_ID` / `KV_NAMESPACE_ID` / `NAME`。  
与「两套 toml」二选一即可，不必混用。

## 注意

- 绑定名必须是：`db`（D1）、`kv`（KV）  
- 改 ID 后提交推送，不要只改控制台「变量和机密」  
- 「变量和机密」里的字符串 ≠ 资源绑定  
