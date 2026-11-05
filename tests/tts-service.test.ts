import { test } from "node:test"
import assert from "node:assert/strict"

import {
  SpeechProviderError,
  synthesizeMiniMaxSpeech,
} from "../lib/audio/tts-service.ts"

const ENV = {
  TTS_ENABLED: "1",
  MINIMAX_TTS_API_KEY: "speech-key",
  MINIMAX_TTS_MODEL: "speech-02-hd",
  MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS: "600000",
}

const INPUT = {
  text: "你终于来了。",
  voiceId: "warm-female",
  speed: 1,
  volume: 1,
}

test("P1-V5 TTS 鉴权、限流、5xx 和网络错误分层", async () => {
  const cases = [
    { response: new Response("{}", { status: 401 }), status: 503, message: /密钥无效/ },
    { response: new Response("{}", { status: 429, headers: { "retry-after": "12" } }), status: 503, message: /频繁/ },
    { response: new Response("{}", { status: 503 }), status: 502, message: /平台语音服务/ },
  ]
  for (const item of cases) {
    await assert.rejects(
      synthesizeMiniMaxSpeech(INPUT, async () => item.response, ENV),
      (error) => {
        assert.ok(error instanceof SpeechProviderError)
        assert.equal(error.status, item.status)
        assert.match(error.message, item.message)
        if (item.response.status === 429) assert.equal(error.retryAfterSeconds, 12)
        return true
      },
    )
  }
  await assert.rejects(
    synthesizeMiniMaxSpeech(INPUT, async () => { throw new TypeError("fetch failed") }, ENV),
    (error) => {
      assert.ok(error instanceof SpeechProviderError)
      assert.equal(error.status, 503)
      assert.match(error.message, /连接失败/)
      return true
    },
  )
})

test("P1-V5 TTS 供应商业务错误不会被保存成音频", async () => {
  await assert.rejects(
    synthesizeMiniMaxSpeech(
      INPUT,
      async () => Response.json({
        base_resp: { status_code: 1004, status_msg: "invalid voice" },
      }),
      ENV,
    ),
    (error) => {
      assert.ok(error instanceof SpeechProviderError)
      assert.equal(error.status, 502)
      assert.match(error.message, /invalid voice/)
      return true
    },
  )
})
