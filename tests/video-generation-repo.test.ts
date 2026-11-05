import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  cancelGenerationTask,
  completeGenerationTask,
  createGenerationBatch,
  createGenerationTask,
  failGenerationTask,
  getGenerationBatch,
  listGeneratedAssets,
  listGenerationTasks,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"

function setup() {
  const db = openDb(":memory:")
  const project = createProject(db, "视频任务测试", "owner-video")
  return { db, project }
}

test("P0-V4 视频任务独立记账、幂等并可按媒体类型筛选", () => {
  const { db, project } = setup()
  const batch = createGenerationBatch(db, {
    projectId: project.id,
    episode: 1,
    scope: { shotIds: ["shot-video-1"] },
    budgetLimitMicros: 20_000_000,
    status: "confirmed",
    idempotencyKey: "batch-video-1",
  })

  const input = {
    projectId: project.id,
    targetType: "shot" as const,
    targetId: "shot-video-1",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "cinematic shot",
    mediaKind: "video" as const,
    batchId: batch.id,
    estimatedCostMicros: 2_600_000,
    maxAttempts: 2,
    idempotencyKey: "video-task-1",
    request: { resolution: "768P", duration: 10 },
  }
  const first = createGenerationTask(db, input)
  const repeated = createGenerationTask(db, input)

  assert.equal(first.id, repeated.id)
  assert.equal(first.mediaKind, "video")
  assert.equal(first.batchId, batch.id)
  assert.equal(first.estimatedCostMicros, 2_600_000)
  assert.equal(first.maxAttempts, 2)
  assert.equal(listGenerationTasks(db, project.id, "shot", "shot-video-1", "video").length, 1)
  assert.equal(listGenerationTasks(db, project.id, "shot", "shot-video-1", "image").length, 0)
  assert.equal(getGenerationBatch(db, batch.id)?.budgetLimitMicros, 20_000_000)
})

test("P0-V5 同一镜头的图片与视频分别维护采用版本", () => {
  const { db, project } = setup()
  const imageTask = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-media-isolation",
    providerId: "aliyun",
    model: "image-model",
    prompt: "first frame",
    mediaKind: "image",
  })
  const videoTask = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-media-isolation",
    providerId: "minimax",
    model: "video-model",
    prompt: "video",
    mediaKind: "video",
  })
  const image = saveGeneratedAsset(db, {
    taskId: imageTask.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-media-isolation",
    storageKey: `generated/${project.id}/image.png`,
    mime: "image/png",
    bytes: 10,
    providerId: "aliyun",
    model: "image-model",
    prompt: "first frame",
    mediaKind: "image",
  })
  const video = saveGeneratedAsset(db, {
    taskId: videoTask.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-media-isolation",
    storageKey: `generated/${project.id}/video.mp4`,
    mime: "video/mp4",
    bytes: 20,
    providerId: "minimax",
    model: "video-model",
    prompt: "video",
    mediaKind: "video",
    durationMs: 5000,
    generationMeta: { ratio: "9:16" },
  })

  selectGeneratedAsset(db, project.id, image.id)
  selectGeneratedAsset(db, project.id, video.id)

  const images = listGeneratedAssets(db, project.id, "shot", "shot-media-isolation", "image")
  const videos = listGeneratedAssets(db, project.id, "shot", "shot-media-isolation", "video")
  assert.equal(images[0].selectedAt !== null, true)
  assert.equal(videos[0].selectedAt !== null, true)
  assert.equal(videos[0].durationMs, 5000)
  assert.deepEqual(videos[0].generationMeta, { ratio: "9:16" })
})

test("P0-V4e 批量任务预留费用、结算实付并收敛终态", () => {
  const { db, project } = setup()
  const batch = createGenerationBatch(db, {
    projectId: project.id,
    episode: 1,
    scope: { shotIds: ["shot-ledger-1", "shot-ledger-2"] },
    budgetLimitMicros: 10_000_000,
  })
  const first = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-ledger-1",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "first",
    mediaKind: "video",
    batchId: batch.id,
    estimatedCostMicros: 2_600_000,
  })
  const second = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-ledger-2",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "second",
    mediaKind: "video",
    batchId: batch.id,
    estimatedCostMicros: 1_300_000,
  })

  const reserved = getGenerationBatch(db, batch.id)
  assert.equal(reserved?.status, "running")
  assert.equal(reserved?.reservedCostMicros, 3_900_000)
  assert.equal(reserved?.actualCostMicros, 0)

  completeGenerationTask(db, first.id, "video-asset-1")
  const partial = getGenerationBatch(db, batch.id)
  assert.equal(partial?.status, "running")
  assert.equal(partial?.reservedCostMicros, 1_300_000)
  assert.equal(partial?.actualCostMicros, 2_600_000)

  failGenerationTask(db, second.id, "provider failed")
  const failed = getGenerationBatch(db, batch.id)
  assert.equal(failed?.status, "stopped")
  assert.equal(failed?.reservedCostMicros, 0)
  assert.equal(failed?.actualCostMicros, 2_600_000)
  assert.equal(failed?.finishedAt !== null, true)

  const allFailedBatch = createGenerationBatch(db, {
    projectId: project.id,
    episode: 2,
    scope: { shotIds: ["shot-ledger-3"] },
    budgetLimitMicros: 5_000_000,
  })
  const canceled = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-ledger-3",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "third",
    mediaKind: "video",
    batchId: allFailedBatch.id,
    estimatedCostMicros: 1_300_000,
  })
  cancelGenerationTask(db, canceled.id)
  const stopped = getGenerationBatch(db, allFailedBatch.id)
  assert.equal(stopped?.status, "stopped")
  assert.equal(stopped?.reservedCostMicros, 0)
  assert.equal(stopped?.actualCostMicros, 0)
})
