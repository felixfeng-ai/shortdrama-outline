import test from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  failGenerationTask,
  reconcileStaleGenerationTasks,
} from "../lib/generation/repo.ts"
import {
  completeVideoRender,
  createVideoRender,
  failVideoRender,
} from "../lib/video/render-repo.ts"
import {
  DAILY_UNITS_PER_IDENTITY,
  QuotaError,
  getQuota,
  releaseQuota,
  reserveQuota,
  settleQuota,
  withQuotaReservation,
} from "../lib/quota.ts"

function memDb() {
  return openDb(":memory:")
}

test("QV2-R1 预扣在模型调用前立即占用余额", () => {
  const db = memDb()
  const hold = reserveQuota(db, "user-a", "shots", {
    requestId: "req-1",
    units: 4,
  })

  assert.equal(hold.status, "reserved")
  assert.equal(hold.units, 4)
  assert.equal(getQuota(db, "user-a").used, 4)
  assert.equal(
    getQuota(db, "user-a").remaining,
    DAILY_UNITS_PER_IDENTITY - 4,
  )
})

test("QV2-R2 成功结算只写入实际用量，差额自动释放", () => {
  const db = memDb()
  const hold = reserveQuota(db, "user-b", "episodes", {
    requestId: "req-2",
    units: 6,
  })

  const settled = settleQuota(db, hold.id, 3)
  assert.equal(settled.status, "settled")
  assert.equal(settled.settledUnits, 3)
  assert.equal(getQuota(db, "user-b").used, 3)
  assert.equal(
    getQuota(db, "user-b").remaining,
    DAILY_UNITS_PER_IDENTITY - 3,
  )
})

test("QV2-R3 供应商失败或取消时全额释放", () => {
  const db = memDb()
  const hold = reserveQuota(db, "user-c", "visual", {
    requestId: "req-3",
    units: 2,
  })

  assert.equal(getQuota(db, "user-c").remaining, DAILY_UNITS_PER_IDENTITY - 2)
  const released = releaseQuota(db, hold.id, "provider_failed")
  assert.equal(released.status, "released")
  assert.equal(getQuota(db, "user-c").remaining, DAILY_UNITS_PER_IDENTITY)
  assert.equal(getQuota(db, "user-c").used, 0)
})

test("QV2-R4 相同 requestId 重试不会重复预扣", () => {
  const db = memDb()
  const first = reserveQuota(db, "user-d", "characters", {
    requestId: "same-request",
    units: 1,
  })
  const second = reserveQuota(db, "user-d", "characters", {
    requestId: "same-request",
    units: 1,
  })

  assert.equal(second.id, first.id)
  assert.equal(getQuota(db, "user-d").used, 1)
})

test("QV2-R5 Agent 同一 turn 达到 3 单位后拒绝第 4 次", () => {
  const db = memDb()
  for (let index = 1; index <= 3; index += 1) {
    const hold = reserveQuota(db, "user-e", "agent", {
      requestId: `agent-${index}`,
      groupId: "turn-1",
      groupLimit: 3,
      units: 1,
    })
    settleQuota(db, hold.id, 1)
  }

  assert.throws(
    () => reserveQuota(db, "user-e", "agent", {
      requestId: "agent-4",
      groupId: "turn-1",
      groupLimit: 3,
      units: 1,
    }),
    (error) => error instanceof QuotaError && /本轮/.test(error.message),
  )
  assert.equal(getQuota(db, "user-e").used, 3)
})

test("QV2-R6 统一包装器成功结算、失败全额返还", async () => {
  const db = memDb()
  const success = await withQuotaReservation(
    db,
    "user-f",
    "characters",
    1,
    async () => "ok",
  )
  assert.equal(success.value, "ok")
  assert.equal(success.reservation.status, "settled")
  assert.equal(getQuota(db, "user-f").used, 1)

  await assert.rejects(
    () => withQuotaReservation(
      db,
      "user-f",
      "visual",
      2,
      async () => { throw new Error("provider failed") },
    ),
    /provider failed/,
  )
  assert.equal(getQuota(db, "user-f").used, 1)
})

test("QV2-R7 异步媒体任务成功结算、失败释放", () => {
  const db = memDb()
  const project = createProject(db, "媒体额度测试", "user-media")

  const imageHold = reserveQuota(db, "user-media", "image", {
    requestId: "image-task-1",
    units: 2,
  })
  const imageTask = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "雨夜码头",
    quotaReservationId: imageHold.id,
    quotaUnits: 2,
  })
  completeGenerationTask(db, imageTask.id, "asset-1")
  assert.equal(getQuota(db, "user-media").used, 2)

  const videoHold = reserveQuota(db, "user-media", "video", {
    requestId: "video-task-1",
    units: 5,
  })
  const videoTask = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "雨夜码头，人物回头",
    mediaKind: "video",
    quotaReservationId: videoHold.id,
    quotaUnits: 5,
  })
  failGenerationTask(db, videoTask.id, "provider failed")
  assert.equal(getQuota(db, "user-media").used, 2)
})

test("QV2-R8 中断的图片任务对账后释放预扣", () => {
  const db = memDb()
  const project = createProject(db, "中断任务", "user-stale")
  const hold = reserveQuota(db, "user-stale", "image", {
    requestId: "stale-image",
    units: 2,
  })
  createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-stale",
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "stale",
    quotaReservationId: hold.id,
    quotaUnits: 2,
  })

  reconcileStaleGenerationTasks(db, project.id, Date.now() + 5_000, 1)
  assert.equal(getQuota(db, "user-stale").used, 0)
})

test("QV2-R9 成片渲染成功结算、失败释放", () => {
  const db = memDb()
  const project = createProject(db, "渲染额度", "user-render")
  const successHold = reserveQuota(db, "user-render", "render", {
    requestId: "render-success",
    units: 8,
  })
  const success = createVideoRender(db, {
    projectId: project.id,
    episode: 1,
    timelineVersionId: "timeline-1",
    timelineRevision: 1,
    quotaReservationId: successHold.id,
    quotaUnits: 8,
  })
  completeVideoRender(db, success.id, {
    durationMs: 10_000,
    videoStorageKey: "video.mp4",
    srtStorageKey: "video.srt",
    manifestStorageKey: "video.json",
  })
  assert.equal(getQuota(db, "user-render").used, 8)

  const failedHold = reserveQuota(db, "user-render", "render", {
    requestId: "render-failed",
    units: 8,
  })
  const failed = createVideoRender(db, {
    projectId: project.id,
    episode: 2,
    timelineVersionId: "timeline-2",
    timelineRevision: 1,
    quotaReservationId: failedHold.id,
    quotaUnits: 8,
  })
  failVideoRender(db, failed.id, "ffmpeg failed")
  assert.equal(getQuota(db, "user-render").used, 8)
})
