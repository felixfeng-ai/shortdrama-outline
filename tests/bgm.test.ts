import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  deleteBgmTrack,
  getBgmTrack,
  listBgmTracks,
  saveBgmTrack,
} from "../lib/audio/bgm-repo.ts"
import {
  initializeEpisodeTimeline,
  saveTimelineDraft,
} from "../lib/timeline/repo.ts"

function setup() {
  const db = openDb(":memory:")
  const project = createProject(db, "BGM 测试", "owner-bgm")
  return { db, project }
}

test("P1-V5 BGM 迁移、授权声明和项目隔离", () => {
  const { db, project } = setup()
  assert.throws(
    () => saveBgmTrack(db, {
      id: "bgm-without-license",
      projectId: project.id,
      name: "未授权",
      storageKey: "generated/demo/no-license.mp3",
      mime: "audio/mpeg",
      bytes: 10,
      durationMs: 1000,
      sha256: "hash-no-license",
      licenseConfirmed: false,
      licenseNote: "",
    }),
    /授权/,
  )

  const saved = saveBgmTrack(db, {
    id: "bgm-1",
    projectId: project.id,
    name: "雨夜主题",
    storageKey: "generated/demo/bgm-1.mp3",
    mime: "audio/mpeg",
    bytes: 1024,
    durationMs: 60_000,
    sha256: "hash-bgm-1",
    licenseConfirmed: true,
    licenseNote: "用户原创",
  })
  assert.equal(saved.name, "雨夜主题")
  assert.equal(getBgmTrack(db, project.id, "bgm-1")?.licenseConfirmed, true)
  assert.equal(listBgmTracks(db, project.id).length, 1)

  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      id: "row-1", entityId: "shot-1", episode: 1, shot: 1,
      scene: "天台", params: { duration: 5 },
    }],
  })
  const draft = initializeEpisodeTimeline(db, project.id, 1).draft
  const updated = saveTimelineDraft(db, project.id, 1, draft.revision, {
    ...draft.payload,
    audio: {
      ...draft.payload.audio,
      bgmAssetId: saved.id,
      bgmVolume: 0.35,
    },
  })
  assert.equal(updated.payload.audio.bgmAssetId, saved.id)
  assert.equal(updated.payload.audio.bgmVolume, 0.35)

  const other = setup()
  assert.equal(getBgmTrack(other.db, other.project.id, "bgm-1"), null)
  assert.equal(deleteBgmTrack(other.db, other.project.id, "bgm-1"), false)
  assert.equal(deleteBgmTrack(db, project.id, "bgm-1"), true)
})
