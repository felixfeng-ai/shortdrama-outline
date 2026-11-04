import fs from "node:fs"
import path from "node:path"

import { applyEnvValues } from "../lib/ops/env-file.ts"

const target = path.resolve(process.env.CHENGJU_ENV_FILE || ".env")
if (!fs.existsSync(target)) {
  console.error(`[deploy-env] 配置文件不存在：${target}`)
  process.exit(1)
}

const current = fs.readFileSync(target, "utf8")
const next = applyEnvValues(current, {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
  WEB_PUSH_PUBLIC_KEY: process.env.WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY: process.env.WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT: process.env.WEB_PUSH_SUBJECT,
  AUTH_ALLOW_DEV_CODE: process.env.AUTH_ALLOW_DEV_CODE,
})

if (next === current) {
  console.log("[deploy-env] 生产配置无需更新")
  process.exit(0)
}

const temporary = `${target}.${process.pid}.tmp`
fs.writeFileSync(temporary, next, { mode: 0o600 })
fs.renameSync(temporary, target)
console.log("[deploy-env] 生产配置已原子更新")
