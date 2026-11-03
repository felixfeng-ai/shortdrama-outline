import { test } from "node:test"
import assert from "node:assert/strict"

import { applyEnvValues } from "../lib/ops/env-file.ts"

test("ENVFILE1 更新已有配置并保留其他密钥", () => {
  const result = applyEnvValues(
    "DEEPSEEK_API_KEY=old\nRESEND_API_KEY=blank\nAUTH_ALLOW_DEV_CODE=1\n",
    {
      RESEND_API_KEY: "re_new",
      AUTH_ALLOW_DEV_CODE: "0",
      AUTH_EMAIL_FROM: "成剧 <login@chenju.work>",
    },
  )
  assert.match(result, /DEEPSEEK_API_KEY=old/)
  assert.match(result, /RESEND_API_KEY="re_new"/)
  assert.match(result, /AUTH_ALLOW_DEV_CODE="0"/)
  assert.match(result, /AUTH_EMAIL_FROM="成剧 <login@chenju.work>"/)
})

test("ENVFILE2 空值不覆盖服务器已有配置", () => {
  const source = "RESEND_API_KEY=existing\nAUTH_EMAIL_FROM=existing@example.com\n"
  assert.equal(applyEnvValues(source, {
    RESEND_API_KEY: "",
    AUTH_EMAIL_FROM: "   ",
  }), source)
})
