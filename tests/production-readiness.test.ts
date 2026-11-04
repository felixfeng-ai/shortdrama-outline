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

test("READY4 部署链可注入 Web Push VAPID 配置", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8")
  const apply = fs.readFileSync("scripts/apply-deploy-env.mjs", "utf8")

  for (const key of [
    "WEB_PUSH_PUBLIC_KEY",
    "WEB_PUSH_PRIVATE_KEY",
    "WEB_PUSH_SUBJECT",
  ]) {
    assert.ok(workflow.includes(key), `workflow 缺少 ${key}`)
    assert.ok(apply.includes(key), `部署环境注入缺少 ${key}`)
  }
})
