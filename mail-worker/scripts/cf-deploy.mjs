#!/usr/bin/env node
/**
 * 按「当前仓库 / 环境」解析 D1、KV 后再部署，不在代码里写死 ID。
 *
 * 优先级：
 *   1. 环境变量 D1_DATABASE_ID / KV_NAMESPACE_ID（每个仓库各自配置）
 *   2. 按资源名查找；没有则创建
 *      资源名默认 = Worker NAME（env.NAME 或 wrangler.toml 的 name）
 *
 * Cloudflare Workers Builds：
 *   Deploy command = pnpm run deploy
 *   并在该项目的 Environment variables 里填该仓库自己的：
 *     D1_DATABASE_ID、KV_NAMESPACE_ID（推荐）
 *     可选 NAME、D1_DATABASE_NAME、KV_NAMESPACE_TITLE
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const baseToml = join(root, "wrangler.toml");
const outToml = join(root, "wrangler.generated.toml");

function readWorkerName() {
  if (process.env.NAME?.trim()) return process.env.NAME.trim();
  const text = readFileSync(baseToml, "utf8");
  return text.match(/^name\s*=\s*"([^"]+)"/m)?.[1] || "cloud-mail";
}

const WORKER_NAME = readWorkerName();
const D1_NAME = (process.env.D1_DATABASE_NAME || WORKER_NAME).trim();
const KV_TITLE = (process.env.KV_NAMESPACE_TITLE || WORKER_NAME).trim();

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
  if (process.env.KV_NAMESPACE_ID?.trim()) {
    const id = process.env.KV_NAMESPACE_ID.trim();
    console.log(`✅ KV from env KV_NAMESPACE_ID => ${id}`);
    return id;
  }

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
  if (!id) throw new Error(`Failed to create/parse KV id for "${KV_TITLE}"`);
  console.log(`✅ Created KV "${KV_TITLE}" => ${id}`);
  return id;
}

function ensureD1() {
  if (process.env.D1_DATABASE_ID?.trim()) {
    const id = process.env.D1_DATABASE_ID.trim();
    console.log(`✅ D1 from env D1_DATABASE_ID => ${id}`);
    return id;
  }

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
  if (!id) throw new Error(`Failed to create/parse D1 id for "${D1_NAME}"`);
  console.log(`✅ D1 "${D1_NAME}" => ${id}`);
  return id;
}

function writeConfig(d1Id, kvId) {
  let text = readFileSync(baseToml, "utf8");

  // allow overriding worker name per repo via env.NAME
  if (process.env.NAME?.trim()) {
    text = text.replace(/^name\s*=\s*"[^"]*"/m, `name = "${WORKER_NAME}"`);
  }

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
  console.log(`Wrote wrangler.generated.toml (worker=${WORKER_NAME}, d1=${D1_NAME}, kv=${KV_TITLE})`);
}

function main() {
  console.log(`Repo deploy context: worker=${WORKER_NAME}, d1Name=${D1_NAME}, kvTitle=${KV_TITLE}`);
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
