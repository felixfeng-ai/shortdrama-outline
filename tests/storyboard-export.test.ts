import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  buildStoryboardExportQuote,
  buildStoryboardSrt,
} from "../lib/production/storyboard-export.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import type { Shot } from "../lib/assets/types.ts"
import {
  createGenerationTask,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"
import {
  readGeneratedAsset,
  resolveGeneratedStoragePath,
  writeGeneratedArtifact,
} from "../lib/generation/files.ts"
import { probeMedia } from "../lib/video/render-engine.ts"
import {
  completeStoryboardExport,
  createStoryboardExport,
} from "../lib/production/storyboard-export-repo.ts"
import { renderStoryboardExport } from "../lib/production/storyboard-export-service.ts"

const segments = [
  {
    id: "s1",
    episode: 1,
    shot: 1,
    durationSeconds: 6,
    speaker: "林晚",
    dialogue: "我不是回来认亲的。",
  },
  {
    id: "s2",
    episode: 1,
    shot: 2,
    durationSeconds: 8,
    speaker: "周沉",
    dialogue: "那封死亡证明，是谁签的字？",
  },
] as never[]

test("EXP1 SRT 按真实镜头时长累计，并保留说话人与字幕", () => {
  const srt = buildStoryboardSrt(segments)

  assert.match(srt, /1\r\n00:00:00,000 --> 00:00:05,700/)
  assert.match(srt, /林晚：我不是回来认亲的。/)
  assert.match(srt, /2\r\n00:00:06,000 --> 00:00:13,700/)
  assert.match(srt, /周沉：那封死亡证明，是谁签的字？/)
})

test("EXP2 TTS 可用时返回字符数与预算，不可用时明确降级", () => {
  const enabled = buildStoryboardExportQuote({
    segments,
    ttsAvailable: true,
    pricePer1kCharsMicros: 300_000,
  })
  assert.equal(enabled.voiceover.available, true)
  assert.equal(enabled.voiceover.characterCount, 41)
  assert.equal(enabled.voiceover.estimatedCostMicros, 12_300)
  assert.equal(enabled.voiceover.reason, null)

  const disabled = buildStoryboardExportQuote({
    segments,
    ttsAvailable: false,
    pricePer1kCharsMicros: null,
  })
  assert.equal(disabled.voiceover.available, false)
  assert.equal(disabled.voiceover.estimatedCostMicros, null)
  assert.match(disabled.voiceover.reason ?? "", /字幕|BGM|未启用/)
})

test("EXP3 导出任务仓储保存 running、ready、failed 和文案", () => {
  const repo = fs.readFileSync("lib/production/storyboard-export-repo.ts", "utf8")
  const route = fs.readFileSync("app/api/projects/[id]/storyboard-exports/route.ts", "utf8")
  const fileRoute = fs.readFileSync("app/api/projects/[id]/storyboard-exports/[exportId]/file/route.ts", "utf8")

  assert.match(repo, /storyboard_exports/)
  assert.match(repo, /createStoryboardExport/)
  assert.match(repo, /completeStoryboardExport/)
  assert.match(repo, /failStoryboardExport/)
  assert.match(route, /renderStoryboardExport/)
  assert.match(route, /enforceApiRateLimit/)
  assert.match(fileRoute, /assertProjectAccess/)
  assert.match(fileRoute, /no-store/)
})

test("EXP4 播放器提供自动配音、BGM、导出和结果状态", () => {
  const player = fs.readFileSync("components/StoryboardPreview.tsx", "utf8")

  assert.match(player, /storyboard-exports/)
  assert.match(player, /自动配音/)
  assert.match(player, /系统 BGM/)
  assert.match(player, /导出分享视频/)
  assert.match(player, /exportBusy/)
  assert.match(player, /下载 MP4/)
})

test("EXP5 真实 FFmpeg 导出 30 秒 MP4 与 SRT", { timeout: 90_000 }, async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "动态分镜导出集成", "local")
  const imagePath = "public/skills/story.png"
  const fixtureShots = Array.from({ length: 5 }, (_, index) => ({
    id: `export-shot-${index + 1}`,
    entityId: `export-entity-${index + 1}`,
    shot: index + 1,
    episode: 1,
    scene: "导出验收",
    characters: ["林晚"],
    action: `第 ${index + 1} 镜`,
    speaker: "林晚",
    dialogue: `第 ${index + 1} 镜对白`,
    place: "导出验收",
    shotSize: "中景",
    camera: "固定",
    prompt: `export fixture ${index + 1}`,
    refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: false },
    status: "done",
  })) as unknown as Shot[]
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: fixtureShots,
  })
  for (const shot of fixtureShots) {
    const bytes = fs.readFileSync(imagePath)
    const file = writeGeneratedArtifact(
      project.id,
      `storyboard-export-fixture/${shot.id}.png`,
      bytes,
    )
    const task = createGenerationTask(db, {
      projectId: project.id,
      targetType: "shot",
      targetId: shot.entityId,
      providerId: "test",
      model: "test-image",
      prompt: "fixture",
      mediaKind: "image",
    })
    const asset = saveGeneratedAsset(db, {
      taskId: task.id,
      projectId: project.id,
      targetType: "shot",
      targetId: shot.entityId,
      storageKey: file.storageKey,
      mime: "image/png",
      bytes: bytes.byteLength,
      providerId: "test",
      model: "test-image",
      prompt: "fixture",
      mediaKind: "image",
    })
    selectGeneratedAsset(db, project.id, asset.id)
  }
  const job = createStoryboardExport(db, project.id, {
    includeNarration: false,
    includeBgm: true,
  })
  const rendered = await renderStoryboardExport({
    db,
    projectId: project.id,
    exportId: job.id,
    identity: "local",
    includeNarration: false,
    includeBgm: true,
    width: 180,
    height: 320,
    fps: 8,
  })
  const completed = completeStoryboardExport(db, project.id, job.id, rendered)
  const probe = await probeMedia(
    resolveGeneratedStoragePath(completed.videoStorageKey!),
  )
  const srt = new TextDecoder().decode(readGeneratedAsset(completed.srtStorageKey!))

  assert.equal(completed.status, "ready")
  assert.ok((probe.durationMs ?? 0) >= 29_000)
  assert.match(srt, /第 5 镜对白/)
  assert.ok(completed.videoStorageKey)
})
