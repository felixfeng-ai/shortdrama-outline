import { test } from "node:test"
import assert from "node:assert/strict"

import {
  buildMiniMaxSpeechRequest,
  countSpeechCharacters,
  estimateSpeechCostMicros,
  getMiniMaxSpeechConfig,
  parseMiniMaxSpeechResponse,
} from "../lib/audio/tts-model.ts"

test("P1-V5 TTS 只从服务端读取供应商、模型和每千字符价格", () => {
  const config = getMiniMaxSpeechConfig({
    TTS_ENABLED: "1",
    MINIMAX_TTS_API_KEY: "speech-key",
    MINIMAX_TTS_MODEL: "speech-02-hd",
    MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS: "600000",
  })
  assert.equal(config.apiKey, "speech-key")
  assert.equal(config.model, "speech-02-hd")
  assert.equal(config.baseUrl, "https://api.minimaxi.com")
  assert.equal(config.pricePer1kCharsMicros, 600_000)
  assert.throws(
    () => getMiniMaxSpeechConfig({
      TTS_ENABLED: "1",
      MINIMAX_TTS_API_KEY: "speech-key",
    }),
    /价格/,
  )
})

test("P1-V5 TTS 字符数和费用按空白去除后的字符计量", () => {
  // 官方计费口径：汉字 2 字符；标点、空格和换行各 1 字符。
  assert.equal(countSpeechCharacters(" 你终于来了。\n我在。 "), 19)
  assert.equal(
    estimateSpeechCostMicros({ characters: 250, pricePer1kCharsMicros: 600_000 }),
    150_000,
  )
  assert.equal(
    estimateSpeechCostMicros({ characters: 0, pricePer1kCharsMicros: 600_000 }),
    0,
  )
})

test("P1-V5 TTS 请求把内部音色映射成真实系统 voice_id", () => {
  const request = buildMiniMaxSpeechRequest({
    text: "你终于来了。",
    voiceId: "warm-female",
    speed: 1.1,
    volume: 0.9,
    model: "speech-02-hd",
  })
  assert.equal(request.url, "https://api.minimaxi.com/v1/t2a_v2")
  assert.equal(request.body.model, "speech-02-hd")
  assert.equal(request.body.stream, false)
  assert.equal(request.body.text, "你终于来了。")
  const voice = request.body.voice_setting as Record<string, unknown>
  assert.equal(voice.voice_id, "female-chengshu")
  assert.equal(voice.speed, 1.1)
  assert.equal(voice.vol, 0.9)
  const audio = request.body.audio_setting as Record<string, unknown>
  assert.equal(audio.format, "mp3")
  assert.equal(audio.sample_rate, 32000)
})

test("P1-V5 TTS 解析 hex 音频、时长和使用量", () => {
  const parsed = parseMiniMaxSpeechResponse({
    data: { audio: "49443304000000000000", status: 2 },
    extra_info: {
      audio_length: 2310,
      usage_characters: 6,
      audio_size: 10,
      audio_format: "mp3",
    },
    trace_id: "trace-1",
    base_resp: { status_code: 0, status_msg: "success" },
  })
  assert.deepEqual([...parsed.bytes], [0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0])
  assert.equal(parsed.mime, "audio/mpeg")
  assert.equal(parsed.durationMs, 2310)
  assert.equal(parsed.usageCharacters, 6)
  assert.throws(
    () => parseMiniMaxSpeechResponse({
      base_resp: { status_code: 1004, status_msg: "invalid voice" },
    }),
    /invalid voice/,
  )
})
