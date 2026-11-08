import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  createGenerationTask,
  saveGeneratedAsset,
} from "../lib/generation/repo.ts"
import { renderDimensions } from "../lib/video/render-service.ts"
import { prepareSmartEpisodeFilm } from "../lib/video/smart-film.ts"

test("SMART-FILM1 自动采用最新视频、匹配系统 BGM 并固化版本", async () => {
  const db = openDb(":memory:")
  const owner = "smart-film-owner"
  const project = createProject(db, "智能成片测试", owner)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      id: "row-1",
      entityId: "shot-1",
      episode: 1,
      shot: 1,
      scene: "雨夜门外",
      speaker: "",
      dialogue: "",
      prompt: "雨夜，快递员站在门外",
      params: { duration: 5, ratio: "9:16" },
      status: "todo",
    }],
  })
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "雨夜，快递员站在门外",
    mediaKind: "video",
  })
  saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    storageKey: `generated/${project.id}/shot-1.mp4`,
    mime: "video/mp4",
    bytes: 100_000,
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "雨夜，快递员站在门外",
    mediaKind: "video",
    durationMs: 5_000,
    width: 480,
    height: 854,
    fps: 30,
    sha256: "smart-film-video-hash",
  })

  const result = await prepareSmartEpisodeFilm(db, {
    projectId: project.id,
    episode: 1,
    identity: owner,
  })

  assert.equal(result.adoptedVideoCount, 1)
  assert.equal(result.version.payload.readyCount, 1)
  assert.ok(result.version.payload.audio.bgmAssetId?.startsWith("system-"))
  assert.equal(result.version.payload.audio.bgmVolume, 0.3)
})

test("SMART-FILM2 预览版和交付版输出固定质量档位", () => {
  const source = { width: 480, height: 854 }
  assert.deepEqual(renderDimensions("preview", source), { width: 480, height: 854 })
  assert.deepEqual(renderDimensions("delivery", source), { width: 1080, height: 1920 })
  assert.deepEqual(
    renderDimensions("delivery", { width: 1920, height: 1080 }, "landscape"),
    { width: 1920, height: 1080 },
  )
  assert.deepEqual(
    renderDimensions("delivery", source, "landscape"),
    { width: 1920, height: 1080 },
  )
  assert.deepEqual(
    renderDimensions("preview", source, "square"),
    { width: 480, height: 480 },
  )
})

test("SMART-FILM3 页面提供一键智能成片和预览/交付档位", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")
  const route = fs.readFileSync("app/api/video/smart-render/route.ts", "utf8")
  const database = fs.readFileSync("lib/assets/db.ts", "utf8")

  assert.match(timeline, /一键智能成片/)
  assert.match(timeline, /smartRenderEpisode/)
  assert.match(timeline, /预览版 · 480P/)
  assert.match(timeline, /交付版 · 1080P/)
  assert.match(timeline, /抖音 \/ 快手 \/ 视频号/)
  assert.match(route, /prepareSmartEpisodeFilm/)
  assert.match(database, /video-render-quality-profile/)
  assert.match(database, /video-render-export-preset/)
})
