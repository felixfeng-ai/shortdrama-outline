import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { checkProductionReadiness } from "../lib/ops/readiness.ts"

test("READY1 生产环境缺少邮箱配置时阻断部署", () => {
  const result = checkProductionReadiness({
    NODE_ENV: "production",
    DEEPSEEK_API_KEY: "deepseek",
    ALIYUN_DASHSCOPE_API_KEY: "dashscope",
    AUTH_SECRET: "a".repeat(32),
    AUTH_ALLOW_DEV_CODE: "0",
  })
  assert.ok(result.errors.some((item) => item.includes("RESEND_API_KEY")))
  assert.ok(result.errors.some((item) => item.includes("AUTH_EMAIL_FROM")))
})

test("READY2 生产配置完整时通过，开发验证码与示例发件人会被拒绝", () => {
  const base = {
    NODE_ENV: "production",
    DEEPSEEK_API_KEY: "deepseek",
    ALIYUN_DASHSCOPE_API_KEY: "dashscope",
    AUTH_SECRET: "a".repeat(32),
    AUTH_ALLOW_DEV_CODE: "0",
    RESEND_API_KEY: "re_live",
    AUTH_EMAIL_FROM: "成剧 <login@chenju.work>",
  }
  assert.deepEqual(checkProductionReadiness(base).errors, [])

  const unsafe = checkProductionReadiness({
    ...base,
    AUTH_ALLOW_DEV_CODE: "1",
    AUTH_EMAIL_FROM: "成剧 <login@your-domain.example>",
  })
  assert.ok(unsafe.errors.some((item) => item.includes("AUTH_ALLOW_DEV_CODE")))
  assert.ok(unsafe.errors.some((item) => item.includes("示例域名")))
})

test("READY3 CI 与部署脚本都具备发布门禁", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8")
  const deploy = fs.readFileSync("deploy/cicd-deploy.sh", "utf8")
  const pkg = fs.readFileSync("package.json", "utf8")

  assert.match(workflow, /npm test/)
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/)
  assert.match(workflow, /npm run build/)
  assert.match(workflow, /needs: verify/)
  assert.match(deploy, /npm run check:prod/)
  assert.match(pkg, /"check:prod"/)
})
