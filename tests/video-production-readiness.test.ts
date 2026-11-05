import assert from "node:assert/strict"
import test from "node:test"

import { checkProductionReadiness } from "../lib/ops/readiness.ts"

const base = {
  NODE_ENV: "production",
  DEEPSEEK_API_KEY: "deepseek",
  ALIYUN_DASHSCOPE_API_KEY: "dashscope",
  AUTH_SECRET: "a".repeat(32),
  AUTH_ALLOW_DEV_CODE: "0",
  RESEND_API_KEY: "re_live",
  AUTH_EMAIL_FROM: "成剧 <login@chenju.work>",
}

test("VIDEO_READY1 开启视频但缺少 MiniMax Key 时阻断生产部署", () => {
  const result = checkProductionReadiness({
    ...base,
    VIDEO_GENERATION_ENABLED: "1",
  })
  assert.ok(result.errors.some((item) => item.includes("MINIMAX_API_KEY")))
})

test("VIDEO_READY2 视频配置完整时允许部署，关闭时只提示", () => {
  const enabled = checkProductionReadiness({
    ...base,
    VIDEO_GENERATION_ENABLED: "1",
    MINIMAX_API_KEY: "video-key",
  })
  assert.equal(enabled.errors.some((item) => item.includes("MINIMAX_API_KEY")), false)

  const disabled = checkProductionReadiness(base)
  assert.ok(disabled.warnings.some((item) => item.includes("视频生成未启用")))
})
