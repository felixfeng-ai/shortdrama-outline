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

test("READY5 开启 TTS 时必须同时配置供应商 Key 与计价", () => {
  const base = {
    NODE_ENV: "production",
    DEEPSEEK_API_KEY: "deepseek",
    ALIYUN_DASHSCOPE_API_KEY: "dashscope",
    AUTH_SECRET: "a".repeat(32),
    AUTH_ALLOW_DEV_CODE: "0",
    RESEND_API_KEY: "re_live",
    AUTH_EMAIL_FROM: "成剧 <login@chenju.work>",
  }
  const disabled = checkProductionReadiness(base)
  assert.ok(disabled.warnings.some((item) => item.includes("TTS")))

  const invalid = checkProductionReadiness({
    ...base,
    TTS_ENABLED: "1",
    MINIMAX_TTS_API_KEY: "",
    MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS: "0",
  })
  assert.ok(invalid.errors.some((item) => item.includes("MINIMAX_TTS_API_KEY")))
  assert.ok(invalid.errors.some((item) => item.includes("MINIMAX_TTS_PRICE")))

  const valid = checkProductionReadiness({
    ...base,
    TTS_ENABLED: "1",
    MINIMAX_TTS_API_KEY: "speech-key",
    MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS: "600000",
  })
  assert.deepEqual(valid.errors, [])
})

test("READY6 部署脚本保留安装与构建退出码，并在构建前校验 Next", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8")
  const deploy = fs.readFileSync("deploy/cicd-deploy.sh", "utf8")

  assert.match(deploy, /set -euo pipefail/)
  assert.match(deploy, /test -f node_modules\/next\/dist\/bin\/next/)
  assert.match(
    deploy,
    /test -f node_modules\/next\/dist\/client\/components\/builtin\/global-not-found\.js/,
  )
  assert.doesNotMatch(
    deploy,
    /npm ci --no-audit --no-fund 2>&1 \| tail -2/,
    "npm ci 的错误不能被子 shell 吞掉",
  )

  const syncAt = workflow.indexOf("git reset --hard origin/main")
  const deployAt = workflow.indexOf("bash /opt/chengju/deploy/cicd-deploy.sh")
  assert.ok(syncAt >= 0, "Actions 没有先同步最新部署脚本")
  assert.ok(deployAt > syncAt, "必须先同步代码再执行服务器部署脚本")
})
