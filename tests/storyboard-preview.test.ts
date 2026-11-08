import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  buildStoryboardPreviewPlan,
} from "../lib/production/storyboard-preview.ts"
import { selectedShotMedia } from "../lib/production/selected-media.ts"
import type { Shot } from "../lib/assets/types.ts"
import type { GeneratedAsset } from "../lib/generation/types.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  createGenerationTask,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"

const NOW = Date.parse("2026-11-09T12:00:00+08:00")

function shots(count: number): Shot[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `shot-${index + 1}`,
    shot: count - index,
    episode: index < Math.ceil(count / 2) ? 2 : 1,
    characters: ["林晚"],
    speaker: "林晚",
    dialogue: `第 ${index + 1} 段对白`,
    action: `第 ${index + 1} 段动作`,
    params: { ratio: "9:16", duration: 5, lastFrame: false },
  })) as unknown as Shot[]
}

function imageAsset(shotId: string, selectedAt: number | null = NOW): GeneratedAsset {
  return {
    id: `image-${shotId}`,
    targetType: "shot",
    targetId: shotId,
    mediaKind: "image",
    selectedAt,
    downloadUrl: `/api/generated-assets/image-${shotId}`,
  } as unknown as GeneratedAsset
}

function videoAsset(shotId: string, durationMs = 8_000, selectedAt = NOW): GeneratedAsset {
  return {
    id: `video-${shotId}`,
    targetType: "shot",
    targetId: shotId,
    mediaKind: "video",
    selectedAt,
    durationMs,
    downloadUrl: `/api/generated-assets/video-${shotId}`,
  } as unknown as GeneratedAsset
}

test("SB1 动态分镜按集号和镜号排序，并优先使用已采用视频", () => {
  const inputShots = shots(3)
  const plan = buildStoryboardPreviewPlan({
    projectId: "project-storyboard",
    shots: inputShots,
    assets: [
      imageAsset("shot-1"),
      videoAsset("shot-3", 9_000),
      imageAsset("shot-2"),
    ],
  })

  assert.deepEqual(
    plan.segments.map((segment) => segment.shotId),
    ["shot-3", "shot-2", "shot-1"],
  )
  assert.equal(plan.segments[0].mediaKind, "video")
  assert.equal(plan.segments[0].durationSeconds, 9)
  assert.equal(plan.segments[1].mediaKind, "image")
})

test("SB2 只使用已采用素材，未采用候选不进入分镜", () => {
  const media = selectedShotMedia(shots(2), [
    imageAsset("shot-1"),
    imageAsset("shot-2", null),
  ])

  assert.equal(media.get("shot-1")?.image?.id, "image-shot-1")
  assert.equal(media.get("shot-2"), undefined)
})

test("SB2b 正式生成图的 shot.entityId 能映射回当前 shot.id", () => {
  const entityShots = [{
    id: "shot-local-id",
    entityId: "shot-stable-entity",
    episode: 1,
    shot: 1,
  }] as unknown as Shot[]
  const asset = {
    id: "image-entity",
    targetType: "shot",
    targetId: "shot-stable-entity",
    mediaKind: "image",
    selectedAt: NOW,
    downloadUrl: "/api/generated-assets/image-entity",
  } as unknown as GeneratedAsset

  const media = selectedShotMedia(entityShots, [asset])

  assert.equal(media.get("shot-local-id")?.image?.id, "image-entity")
})

test("SB3 五张首帧达到 30 秒 ready，四张首帧 24 秒 insufficient", () => {
  const readyShots = shots(5)
  const ready = buildStoryboardPreviewPlan({
    projectId: "project-storyboard",
    shots: readyShots,
    assets: readyShots.map((shot) => imageAsset(shot.id)),
  })
  assert.equal(ready.status, "ready")
  assert.equal(ready.totalDurationSeconds, 30)
  assert.equal(ready.imageSegments, 5)
  assert.equal(ready.videoSegments, 0)

  const shortShots = shots(4)
  const insufficient = buildStoryboardPreviewPlan({
    projectId: "project-storyboard",
    shots: shortShots,
    assets: shortShots.map((shot) => imageAsset(shot.id)),
  })
  assert.equal(insufficient.status, "insufficient")
  assert.equal(insufficient.totalDurationSeconds, 24)
})

test("SB4 真实视频时长被限制在 2-10 秒，总时长不超过 45 秒", () => {
  const short = buildStoryboardPreviewPlan({
    projectId: "project-storyboard",
    shots: shots(1),
    assets: [videoAsset("shot-1", 600)],
  })
  const long = buildStoryboardPreviewPlan({
    projectId: "project-storyboard",
    shots: shots(1),
    assets: [videoAsset("shot-1", 30_000)],
  })
  const capped = buildStoryboardPreviewPlan({
    projectId: "project-storyboard",
    shots: shots(6),
    assets: [
      videoAsset("shot-1", 600),
      videoAsset("shot-2", 30_000),
      videoAsset("shot-3", 10_000),
      videoAsset("shot-4", 10_000),
      videoAsset("shot-5", 10_000),
      videoAsset("shot-6", 10_000),
    ],
  })

  assert.equal(short.segments[0].durationSeconds, 2)
  assert.equal(long.segments[0].durationSeconds, 10)
  assert.ok(capped.totalDurationSeconds <= 45)
  assert.ok(capped.totalDurationSeconds >= 30)
})

test("SB5 动态分镜 API、页面、播放器和快速结果入口已接线", () => {
  const api = fs.readFileSync("app/api/projects/[id]/storyboard-preview/route.ts", "utf8")
  const page = fs.readFileSync("app/storyboard/[projectId]/page.tsx", "utf8")
  const player = fs.readFileSync("components/StoryboardPreview.tsx", "utf8")
  const css = fs.readFileSync("app/storyboard/storyboard.css", "utf8")
  const progress = fs.readFileSync("components/QuickTrialProgress.tsx", "utf8")
  const workspace = fs.readFileSync("app/page.tsx", "utf8")

  assert.match(api, /assertProjectAccess/)
  assert.match(api, /buildStoryboardPreviewPlan/)
  assert.match(api, /auditProductionAcceptance/)
  assert.match(api, /no-store/)
  assert.match(page, /StoryboardPreview/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(player, /Space/)
  assert.match(player, /insufficient/)
  assert.match(progress, /播放动态分镜/)
  assert.match(workspace, /storyboard\/\$\{/)
})

test("SB6 动态分镜路由从真实数据库事实返回 30 秒 ready 分镜且不泄露存储键", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "动态分镜路由集成", "local")
  const fixtureShots = shots(5)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: fixtureShots,
  })

  for (const shot of fixtureShots) {
    const task = createGenerationTask(db, {
      projectId: project.id,
      targetType: "shot",
      targetId: shot.id,
      providerId: "test",
      model: "test-image",
      prompt: "fixture",
      mediaKind: "image",
    })
    const asset = saveGeneratedAsset(db, {
      taskId: task.id,
      projectId: project.id,
      targetType: "shot",
      targetId: shot.id,
      storageKey: `generated/${project.id}/${shot.id}.png`,
      mime: "image/png",
      bytes: 100,
      providerId: "test",
      model: "test-image",
      prompt: "fixture",
      mediaKind: "image",
    })
    selectGeneratedAsset(db, project.id, asset.id)
  }

  const { GET } = await import("../app/api/projects/[id]/storyboard-preview/route.ts")
  const response = await GET(
    new Request(`http://localhost/api/projects/${project.id}/storyboard-preview`),
    { params: Promise.resolve({ id: project.id }) },
  )
  const payload = await response.json()
  const serialized = JSON.stringify(payload)

  assert.equal(response.status, 200)
  assert.equal(payload.data.preview.status, "ready")
  assert.equal(payload.data.preview.totalDurationSeconds, 30)
  assert.equal(payload.data.preview.segmentCount, 5)
  assert.doesNotMatch(serialized, /storageKey/)
  assert.doesNotMatch(serialized, /fixture/)
})
