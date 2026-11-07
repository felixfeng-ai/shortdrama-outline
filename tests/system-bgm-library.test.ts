import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import { openDb } from "../lib/assets/db.ts"
import {
  getBgmTrack,
  listBgmFavoriteIds,
  setBgmFavorite,
} from "../lib/audio/bgm-repo.ts"
import {
  recommendSystemBgmTracks,
  SYSTEM_BGM_TRACKS,
} from "../lib/audio/system-bgm.ts"

test("SYS-BGM1 系统曲库包含 20 首可播放原创曲目与完整标签", () => {
  assert.equal(SYSTEM_BGM_TRACKS.length, 20)
  for (const track of SYSTEM_BGM_TRACKS) {
    assert.ok(track.previewUrl)
    assert.ok(track.bpm && track.bpm > 0)
    assert.ok(track.tags && track.tags.length >= 3)
    assert.ok(track.waveform && track.waveform.length >= 24)
    assert.ok(track.licenseName)
    const file = path.join(
      process.cwd(),
      "public",
      track.storageKey,
    )
    assert.equal(fs.existsSync(file), true)
    assert.ok(fs.statSync(file).size > 10_000)
  }
})

test("SYS-BGM2 推荐按项目事实匹配悬疑、情感和喜剧情绪", () => {
  const suspense = recommendSystemBgmTracks("雨夜快递员调查遗产交易和门后的秘密")
  const romance = recommendSystemBgmTracks("久别重逢，两个人靠近并告白")
  const comedy = recommendSystemBgmTracks("轻喜日常里的尴尬误会和搞笑反差")

  assert.ok(suspense.some((track) => track.mood === "悬疑"))
  assert.ok(romance.some((track) => track.mood === "暧昧" || track.mood === "情感"))
  assert.ok(comedy.some((track) => track.mood === "轻松" || track.mood === "喜剧"))
})

test("SYS-BGM3 收藏按 owner 持久化且只接受系统曲目", () => {
  const db = openDb(":memory:")
  const id = "system-rain-mystery"
  assert.deepEqual(listBgmFavoriteIds(db, "owner-a"), [])
  assert.deepEqual(setBgmFavorite(db, "owner-a", id, true), [id])
  assert.deepEqual(listBgmFavoriteIds(db, "owner-b"), [])
  assert.deepEqual(setBgmFavorite(db, "owner-a", id, false), [])
  assert.throws(
    () => setBgmFavorite(db, "owner-a", "uploaded-track", true),
    /只能收藏系统曲库/,
  )
})

test("SYS-BGM4 时间线可通过 getBgmTrack 解析系统曲目", () => {
  const db = openDb(":memory:")
  const track = getBgmTrack(db, "any-project", "system-rain-mystery")
  assert.equal(track?.sourceType, "system")
  assert.equal(track?.previewUrl, "/audio/bgm/system/rain-mystery.mp3")
  assert.equal(track?.licenseName, "VeyaFrame Original License")
})
