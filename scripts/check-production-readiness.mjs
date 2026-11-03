import fs from "node:fs"
import path from "node:path"

import { checkProductionReadiness } from "../lib/ops/readiness.ts"

function parseEnvFile(filePath) {
  const parsed = {}
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1)
    parsed[match[1]] = value
  }
  return parsed
}

const root = process.cwd()
const env = {}
for (const file of [".env", ".env.local", ".env.production.local"]) {
  const filePath = path.join(root, file)
  if (!fs.existsSync(filePath)) continue
  Object.assign(env, parseEnvFile(filePath))
}
Object.assign(env, process.env)

const result = checkProductionReadiness(env)
for (const warning of result.warnings) console.warn(`[readiness] 提醒：${warning}`)
if (result.errors.length > 0) {
  for (const error of result.errors) console.error(`[readiness] 阻断：${error}`)
  process.exit(1)
}
console.log("[readiness] 生产关键配置检查通过")
