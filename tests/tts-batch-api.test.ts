import { test } from "node:test"
import assert from "node:assert/strict"

import { GET as getAudioState } from "../app/api/audio/tts/route.ts"
import { POST as postTtsBatch } from "../app/api/audio/tts/batch/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { upsertVoiceProfile } from "../lib/audio/repo.ts"

const OWNER = `anon_${"b".repeat(48)}`

function headers(): Headers {
  return new Headers({
    cookie: `chengju_sid=${OWNER}`,
    "content-type": "application/json",
  })
}

function setup() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "批量 TTS", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "characters",
    payload: [
      { id: "character-1", name: "林晚" },
      { id: "character-2", name: "周沉" },
    ],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [
      {
        id: "row-1", entityId: "shot-1", episode: 1, shot: 1,
        scene: "天台", speaker: "林晚", dialogue: "你来了。", params: { duration: 5 },
      },
      {
        id: "row-2", entityId: "shot-2", episode: 1, shot: 2,
        scene: "走廊", speaker: "周沉", dialogue: "跟我走。", params: { duration: 5 },
      },
      {
        id: "row-3", entityId: "shot-3", episode: 2, shot: 1,
        scene: "别集", speaker: "林晚", dialogue: "别走。", params: { duration: 5 },
      },
    ],
  })
  upsertVoiceProfile(db, project.id, "character-1", { voiceId: "warm-female" })
  upsertVoiceProfile(db, project.id, "character-2", { voiceId: "steady-male" })
  return { db, project }
}

function setEnv() {
  process.env.TTS_ENABLED = "1"
  process.env.MINIMAX_TTS_API_KEY = "speech-key"
  process.env.MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS = "350000"
  process.env.MINIMAX_TTS_MODEL = "speech-02-hd"
  process.env.API_AUDIO_IP_10M_LIMIT = "100"
  process.env.API_AUDIO_IDENTITY_10M_LIMIT = "100"
  process.env.API_AUDIO_GLOBAL_DAILY_LIMIT = "1000"
}

function clearEnv() {
  for (const key of [
    "TTS_ENABLED", "MINIMAX_TTS_API_KEY", "MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS",
    "MINIMAX_TTS_MODEL", "API_AUDIO_IP_10M_LIMIT", "API_AUDIO_IDENTITY_10M_LIMIT",
    "API_AUDIO_GLOBAL_DAILY_LIMIT",
  ]) delete process.env[key]
}

test("P1-V5 批量 TTS 只处理指定集，2 路并发并完成批次结算", async () => {
  const { project } = setup()
  setEnv()
  const originalFetch = globalThis.fetch
  let calls = 0
  let active = 0
  let maxActive = 0
  globalThis.fetch = (async () => {
    calls += 1
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, 20))
    active -= 1
    return Response.json({
      data: { audio: "49443304000000000000", status: 2 },
      extra_info: { audio_length: 1200, usage_characters: 9, audio_size: 10 },
      base_resp: { status_code: 0, status_msg: "success" },
    })
  }) as typeof fetch
  try {
    const response = await postTtsBatch(new Request("http://localhost/api/audio/tts/batch", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        projectId: project.id,
        episode: 1,
        maxBudgetMicros: 20_000,
        idempotencyKey: "batch-tts-1",
      }),
    }))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.data.tasks.length, 2)
    assert.equal(payload.data.assets.length, 2)
    assert.equal(payload.data.blocked.length, 0)
    assert.equal(payload.data.failures.length, 0)
    assert.equal(payload.data.batch.status, "completed")
    assert.equal(calls, 2)
    assert.equal(maxActive, 2)

    const state = await getAudioState(new Request(
      `http://localhost/api/audio/tts?projectId=${project.id}`,
      { headers: new Headers({ cookie: `chengju_sid=${OWNER}` }) },
    ))
    const statePayload = await state.json()
    assert.equal(state.status, 200)
    assert.equal(statePayload.data.tasks.length, 2)
    assert.equal(statePayload.data.assets.length, 2)
    assert.equal(statePayload.data.batches[0].status, "completed")
  } finally {
    globalThis.fetch = originalFetch
    clearEnv()
  }
})

test("P1-V5 批量 TTS 预算不足时不调用供应商", async () => {
  const { project } = setup()
  setEnv()
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => {
    called = true
    return Response.json({})
  }) as typeof fetch
  try {
    const response = await postTtsBatch(new Request("http://localhost/api/audio/tts/batch", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        projectId: project.id,
        episode: 1,
        maxBudgetMicros: 1,
      }),
    }))
    const payload = await response.json()
    assert.equal(response.status, 400)
    assert.match(payload.error, /整批预计费用.*超过本次预算/)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
    clearEnv()
  }
})
