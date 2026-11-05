import { test } from "node:test"
import assert from "node:assert/strict"

import { POST as postTts } from "../app/api/audio/tts/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { upsertVoiceProfile } from "../lib/audio/repo.ts"
import { getGenerationTask, listGeneratedAssets } from "../lib/generation/repo.ts"

const OWNER = `anon_${"a".repeat(48)}`

function headers(json = false): Headers {
  const result = new Headers({ cookie: `chengju_sid=${OWNER}` })
  if (json) result.set("content-type", "application/json")
  return result
}

function setup(withVoice = true) {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "TTS 接口", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "characters",
    payload: [{ id: "character-1", name: "林晚" }],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      id: "shot-row-1",
      entityId: "shot-tts-1",
      episode: 1,
      shot: 1,
      scene: "雨夜天台",
      speaker: "林晚",
      dialogue: "你终于来了。",
      params: { duration: 5 },
    }],
  })
  if (withVoice) {
    upsertVoiceProfile(db, project.id, "character-1", {
      voiceId: "warm-female",
      speed: 1.1,
      volume: 0.9,
    })
  }
  return { db, project }
}

function setTtsEnv() {
  process.env.TTS_ENABLED = "1"
  process.env.MINIMAX_TTS_API_KEY = "speech-test-key"
  process.env.MINIMAX_TTS_MODEL = "speech-02-hd"
  process.env.MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS = "600000"
  process.env.API_AUDIO_IP_10M_LIMIT = "100"
  process.env.API_AUDIO_IDENTITY_10M_LIMIT = "100"
  process.env.API_AUDIO_GLOBAL_DAILY_LIMIT = "1000"
}

function clearTtsEnv() {
  for (const key of [
    "TTS_ENABLED",
    "MINIMAX_TTS_API_KEY",
    "MINIMAX_TTS_MODEL",
    "MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS",
    "API_AUDIO_IP_10M_LIMIT",
    "API_AUDIO_IDENTITY_10M_LIMIT",
    "API_AUDIO_GLOBAL_DAILY_LIMIT",
  ]) delete process.env[key]
}

test("P1-V5 对白 TTS 从服务端台词生成、计费并保存音频资产", async () => {
  const { db, project } = setup()
  setTtsEnv()
  const originalFetch = globalThis.fetch
  let submitted: Record<string, unknown> | null = null
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    submitted = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    return Response.json({
      data: { audio: "49443304000000000000", status: 2 },
      extra_info: {
        audio_length: 2300,
        usage_characters: 6,
        audio_size: 10,
        audio_format: "mp3",
      },
      trace_id: "trace-tts-1",
      base_resp: { status_code: 0, status_msg: "success" },
    })
  }) as typeof fetch

  try {
    const response = await postTts(new Request("http://localhost/api/audio/tts", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        projectId: project.id,
        shotId: "shot-tts-1",
        maxBudgetMicros: 10_000,
        idempotencyKey: "tts-shot-1",
      }),
    }))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.data.task.status, "succeeded")
    assert.equal(payload.data.task.mediaKind, "audio")
    assert.equal(payload.data.task.estimatedCostMicros, 6_600)
    assert.equal(payload.data.asset.mime, "audio/mpeg")
    assert.equal(payload.data.asset.durationMs, 2300)
    assert.equal(payload.data.asset.downloadUrl.includes("/api/generated-assets/"), true)
    assert.ok(submitted)
    const voice = (submitted as Record<string, unknown>).voice_setting as Record<string, unknown>
    assert.equal(voice.voice_id, "female-chengshu")
    assert.equal((submitted as Record<string, unknown>).text, "你终于来了。")
    assert.equal(getGenerationTask(db, payload.data.task.id)?.status, "succeeded")
    assert.equal(listGeneratedAssets(db, project.id, "shot", "shot-tts-1", "audio").length, 1)
  } finally {
    globalThis.fetch = originalFetch
    clearTtsEnv()
  }
})

test("P1-V5 未绑定音色或预算不足时在调用供应商前拒绝", async () => {
  const missing = setup(false)
  setTtsEnv()
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => {
    called = true
    return Response.json({})
  }) as typeof fetch
  try {
    const response = await postTts(new Request("http://localhost/api/audio/tts", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        projectId: missing.project.id,
        shotId: "shot-tts-1",
        maxBudgetMicros: 10_000,
      }),
    }))
    const payload = await response.json()
    assert.equal(response.status, 400)
    assert.match(payload.error, /先为角色.*绑定系统音色/)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
    clearTtsEnv()
  }

  const funded = setup(true)
  setTtsEnv()
  globalThis.fetch = (async () => {
    called = true
    return Response.json({})
  }) as typeof fetch
  try {
    called = false
    const response = await postTts(new Request("http://localhost/api/audio/tts", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        projectId: funded.project.id,
        shotId: "shot-tts-1",
        maxBudgetMicros: 100,
      }),
    }))
    const payload = await response.json()
    assert.equal(response.status, 400)
    assert.match(payload.error, /超过本次预算/)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
    clearTtsEnv()
  }
})
