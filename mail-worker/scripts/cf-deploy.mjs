#!/usr/bin/env node
/**
 * Cloudflare Workers Builds / 本地部署入口：
 * 自动查找或创建 D1(cloud-mail) 与 KV(cloud-mail)，写入临时配置后 deploy。
 *
 * Cloudflare 控制台 → 设置 → 构建 → Deploy command 请设为：
 *   pnpm run deploy
 * （项目根目录选 mail-worker）
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const baseToml = join(root, "wrangler.toml");
const outToml = join(root, "wrangler.generated.toml");
const D1_NAME = "cloud-mail";
const KV_TITLE = "cloud-mail";

function wrangler(args, inherit = false) {
  const res = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: inherit ? "inherit" : "pipe",
  });
  return {
    status: res.status ?? 1,
    out: inherit ? "" : `${res.stdout || ""}${res.stderr || ""}`,
    stdout: res.stdout || "",
  };
}

function parseId(text, key) {
  const re = new RegExp(`${key}\\s*=\\s*"([^"]+)"`);
  return text.match(re)?.[1] || "";
}

function ensureKv() {
  const listed = wrangler(["kv", "namespace", "list", "--json"]);
  try {
    const arr = JSON.parse(listed.stdout || listed.out);
    const hit = (Array.isArray(arr) ? arr : []).find((n) => n.title === KV_TITLE);
    if (hit?.id) {
      console.log(`✅ KV "${KV_TITLE}" => ${hit.id}`);
      return hit.id;
    }
  } catch {
    /* continue to create */
  }

  console.log(`Creating KV namespace "${KV_TITLE}"...`);
  const created = wrangler(["kv", "namespace", "create", KV_TITLE]);
  console.log(created.out);
  const id = parseId(created.out, "id");
  if (!id) throw new Error("Failed to create/parse KV namespace id");
  console.log(`✅ Created KV "${KV_TITLE}" => ${id}`);
  return id;
}

function ensureD1() {
  const listed = wrangler(["d1", "list", "--json"]);
  try {
    const arr = JSON.parse(listed.stdout || listed.out);
    const hit = (Array.isArray(arr) ? arr : []).find((n) => n.name === D1_NAME);
    const id = hit?.uuid || hit?.database_id || "";
    if (id) {
      console.log(`✅ D1 "${D1_NAME}" => ${id}`);
      return id;
    }
  } catch {
    /* continue to create */
  }

  console.log(`Creating D1 database "${D1_NAME}"...`);
  const created = wrangler(["d1", "create", D1_NAME]);
  console.log(created.out);
  let id = parseId(created.out, "database_id");
  if (!id) {
    const again = wrangler(["d1", "list", "--json"]);
    try {
      const arr = JSON.parse(again.stdout || again.out);
      id = (Array.isArray(arr) ? arr : []).find((n) => n.name === D1_NAME)?.uuid || "";
    } catch {
      /* ignore */
    }
  }
  if (!id) throw new Error("Failed to create/parse D1 database id");
  console.log(`✅ D1 "${D1_NAME}" => ${id}`);
  return id;
}

function writeConfig(d1Id, kvId) {
  let text = readFileSync(baseToml, "utf8");

  // drop the commented D1/KV guidance + stubs
  text = text.replace(
    /\n# D1 \/ KV[\s\S]*?(?=\n#\[\[r2_buckets\]\]|\n\[\[r2_buckets\]\]|\n\[ai\])/,
    "\n"
  );

  const bindings = `
[[d1_databases]]
binding = "db"
database_name = "${D1_NAME}"
database_id = "${d1Id}"

[[kv_namespaces]]
binding = "kv"
id = "${kvId}"
`;

  if (text.includes("\n[ai]")) {
    text = text.replace("\n[ai]", `\n${bindings}\n[ai]`);
  } else {
    text += `\n${bindings}\n`;
  }

  writeFileSync(outToml, text);
  console.log(`Wrote wrangler.generated.toml`);
}

function main() {
  const kvId = ensureKv();
  const d1Id = ensureD1();
  writeConfig(d1Id, kvId);

  console.log("🚀 Deploying...");
  const deploy = wrangler(["deploy", "-c", "wrangler.generated.toml"], true);

  if (existsSync(outToml)) {
    try {
      unlinkSync(outToml);
    } catch {
      /* ignore */
    }
  }

  if (deploy.status !== 0) process.exit(deploy.status || 1);
  console.log("✅ Deploy finished");
}

try {
  main();
} catch (e) {
  console.error("❌", e.message || e);
  process.exit(1);
}
