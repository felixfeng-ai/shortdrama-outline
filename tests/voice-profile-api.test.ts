import { test } from "node:test"
import assert from "node:assert/strict"

import { GET as getVoiceProfiles } from "../app/api/audio/voice-profiles/route.ts"
import {
  DELETE as deleteVoiceProfileRoute,
  PUT as putVoiceProfile,
} from "../app/api/audio/voice-profiles/[characterId]/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const OWNER = `anon_${"v".repeat(48)}`

function headers(owner = OWNER, json = false): Headers {
  const result = new Headers({ cookie: `chengju_sid=${owner}` })
  if (json) result.set("content-type", "application/json")
  return result
}

function context(characterId: string) {
  return { params: Promise.resolve({ characterId }) }
}

function setup() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "音色接口", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "characters",
    payload: [{ id: "character-1", name: "林晚" }],
  })
  return { db, project }
}

test("P1-V5 音色接口可读取目录、保存绑定并删除绑定", async () => {
  const { project } = setup()
  const initial = await getVoiceProfiles(new Request(
    `http://localhost/api/audio/voice-profiles?projectId=${project.id}`,
    { headers: headers() },
  ))
  const initialBody = await initial.json()
  assert.equal(initial.status, 200)
  assert.ok(initialBody.data.voices.length >= 4)
  assert.deepEqual(initialBody.data.characters, [{ id: "character-1", name: "林晚" }])
  assert.deepEqual(initialBody.data.profiles, [])

  const saved = await putVoiceProfile(new Request(
    "http://localhost/api/audio/voice-profiles/character-1",
    {
      method: "PUT",
      headers: headers(OWNER, true),
      body: JSON.stringify({
        projectId: project.id,
        voiceId: "warm-female",
        speed: 1.1,
        volume: 0.9,
      }),
    },
  ), context("character-1"))
  const savedBody = await saved.json()
  assert.equal(saved.status, 200)
  assert.equal(savedBody.data.profile.characterEntityId, "character-1")
  assert.equal(savedBody.data.profile.label, "温润女声")

  const removed = await deleteVoiceProfileRoute(new Request(
    `http://localhost/api/audio/voice-profiles/character-1?projectId=${project.id}`,
    { method: "DELETE", headers: headers() },
  ), context("character-1"))
  const removedBody = await removed.json()
  assert.equal(removed.status, 200)
  assert.equal(removedBody.data.deleted, true)
})

test("P1-V5 音色接口按项目 owner 隔离", async () => {
  const { project } = setup()
  const response = await getVoiceProfiles(new Request(
    `http://localhost/api/audio/voice-profiles?projectId=${project.id}`,
    { headers: headers(`anon_${"x".repeat(48)}`) },
  ))
  assert.equal(response.status, 403)
})
