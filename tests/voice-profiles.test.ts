import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  deleteVoiceProfile,
  listVoiceCharacters,
  listVoiceProfiles,
  upsertVoiceProfile,
} from "../lib/audio/repo.ts"
import { SYSTEM_VOICES } from "../lib/audio/voices.ts"

function setup(title = "音色项目") {
  const db = openDb(":memory:")
  const project = createProject(db, title, "owner-voice")
  createSnapshot(db, {
    projectId: project.id,
    kind: "characters",
    payload: [
      { id: "character-1", name: "林晚", identity: "记者" },
      { id: "character-2", name: "周沉", identity: "刑警" },
    ],
  })
  return { db, project }
}

test("P1-V5 音色目录使用稳定系统标识且不包含声音克隆", () => {
  const db = openDb(":memory:")
  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'voice_profiles'",
  ).get() as { name: string } | undefined
  assert.equal(table?.name, "voice_profiles")
  db.close()
  assert.ok(SYSTEM_VOICES.length >= 4)
  assert.equal(new Set(SYSTEM_VOICES.map((voice) => voice.id)).size, SYSTEM_VOICES.length)
  assert.equal(SYSTEM_VOICES.every((voice) => voice.providerId === "system"), true)
})

test("P1-V5 角色音色按角色唯一绑定、改绑更新当前值并按项目隔离", () => {
  const { db, project } = setup()
  const characters = listVoiceCharacters(db, project.id)
  assert.deepEqual(characters.map((character) => character.name), ["林晚", "周沉"])

  const first = upsertVoiceProfile(db, project.id, "character-1", {
    voiceId: "warm-female",
    speed: 1,
    volume: 1,
  })
  assert.equal(first.label, "温润女声")
  const rebound = upsertVoiceProfile(db, project.id, "character-1", {
    voiceId: "clear-female",
    speed: 1.1,
    volume: 0.9,
  })
  assert.equal(rebound.id, first.id)
  assert.equal(rebound.voiceId, "clear-female")
  assert.equal(listVoiceProfiles(db, project.id).length, 1)

  const other = setup("另一个音色项目")
  upsertVoiceProfile(other.db, other.project.id, "character-1", {
    voiceId: "steady-male",
  })
  assert.equal(listVoiceProfiles(db, project.id)[0].voiceId, "clear-female")
  assert.equal(listVoiceProfiles(other.db, other.project.id)[0].voiceId, "steady-male")
})

test("P1-V5 音色绑定拒绝未知角色、未知音色和非法参数", () => {
  const { db, project } = setup()
  assert.throws(
    () => upsertVoiceProfile(db, project.id, "missing", { voiceId: "warm-female" }),
    /角色不存在/,
  )
  assert.throws(
    () => upsertVoiceProfile(db, project.id, "character-1", { voiceId: "clone-my-voice" }),
    /系统音色不存在/,
  )
  assert.throws(
    () => upsertVoiceProfile(db, project.id, "character-1", {
      voiceId: "warm-female",
      speed: 3,
    }),
    /语速/,
  )
  assert.throws(
    () => upsertVoiceProfile(db, project.id, "character-1", {
      voiceId: "warm-female",
      volume: -1,
    }),
    /音量/,
  )
})

test("P1-V5 删除音色绑定只影响当前角色", () => {
  const { db, project } = setup()
  upsertVoiceProfile(db, project.id, "character-1", { voiceId: "warm-female" })
  upsertVoiceProfile(db, project.id, "character-2", { voiceId: "steady-male" })
  assert.equal(deleteVoiceProfile(db, project.id, "character-1"), true)
  assert.deepEqual(
    listVoiceProfiles(db, project.id).map((profile) => profile.characterEntityId),
    ["character-2"],
  )
  assert.equal(deleteVoiceProfile(db, project.id, "character-1"), false)
})
