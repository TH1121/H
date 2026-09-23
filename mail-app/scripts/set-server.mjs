#!/usr/bin/env node
/**
 * 同步更新 Capacitor 与鸿蒙壳的线上地址
 * 用法: node scripts/set-server.mjs https://your-domain.com
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const urlArg = process.argv[2]

if (!urlArg || !/^https:\/\//.test(urlArg)) {
  console.error('Usage: node scripts/set-server.mjs https://your-domain.com')
  process.exit(1)
}

const url = urlArg.replace(/\/$/, '')
const host = new URL(url).hostname

const configPath = path.join(root, 'capacitor.config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
config.server = config.server || {}
config.server.url = url
const nav = new Set(config.server.allowNavigation || [])
nav.add(host)
nav.add(`*.${host}`)
config.server.allowNavigation = [...nav]
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
console.log(`capacitor.config.json server.url -> ${url}`)

const harmonyConfig = path.join(
  root,
  'harmony/entry/src/main/ets/config/AppConfig.ets'
)
if (fs.existsSync(harmonyConfig)) {
  const next =
    `/** 与 Capacitor server.url 保持一致；换域名时同步改这里 */\n` +
    `export const APP_SERVER_URL: string = '${url}';\n`
  fs.writeFileSync(harmonyConfig, next)
  console.log(`harmony AppConfig.ets APP_SERVER_URL -> ${url}`)
}

console.log('Next: npx cap sync android && npx cap sync ios')
