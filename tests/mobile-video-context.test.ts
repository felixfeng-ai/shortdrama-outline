import assert from "node:assert/strict"
import test from "node:test"

import { buildMobileContext } from "../lib/mobile-context.ts"
import { buildMobileVideoView } from "../lib/mobile-video.ts"
import type { GeneratedAsset, GenerationTask } from "../lib/generation/types.ts"
import { getPublicVideoCapabilities } from "../lib/video/model.ts"

const now = Date.parse("2026-11-05T10:00:00+08:00")
const projects = [{
  id: "p1",
  title: "夜港来信",
  ownerId: "u1",
  createdAt: 1,
  updatedAt: now,
}]

const shots = [
  {
    id: "shot-row-1",
    entityId: "shot-1",
    episode: 1,
    shot: 1,
    scene: "码头",
    prompt: "rainy dock",
    action: "回头",
    characters: [],
    missingRefFor: [],
    status: "todo",
    shotSize: "中景",
    camera: "固定",
    speaker: "",
    dialogue: "",
    place: "码头",
    refImages: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false },
  },
  {
    id: "shot-row-2",
    entityId: "shot-2",
    episode: 1,
    shot: 2,
    scene: "门口",
    prompt: "open the door",
    action: "开门",
    characters: [],
    missingRefFor: [],
    status: "todo",
    shotSize: "近景",
    camera: "固定",
    speaker: "",
    dialogue: "",
    place: "门口",
    refImages: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false },
  },
  {
    id: "shot-row-3",
    entityId: "shot-3",
    episode: 1,
    shot: 3,
    scene: "楼梯",
    prompt: "walk upstairs",
    action: "上楼",
    characters: [],
    missingRefFor: [],
    status: "todo",
    shotSize: "全景",
    camera: "跟拍",
    speaker: "",
    dialogue: "",
    place: "楼梯",
    refImages: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false },
  },
]

function asset(
  id: string,
  targetId: string,
  mediaKind: "image" | "video",
  selectedAt: number | null,
): GeneratedAsset {
  return {
    id,
    taskId: `task-${id}`,
    projectId: "p1",
    targetType: "shot",
    targetId,
    storageKey: `generated/p1/${id}.${mediaKind === "video" ? "mp4" : "png"}`,
    mime: mediaKind === "video" ? "video/mp4" : "image/png",
    bytes: 100,
    providerId: mediaKind === "video" ? "minimax" : "aliyun",
    model: mediaKind === "video" ? "MiniMax-H3-Lite" : "wanx",
    prompt: "prompt",
    mediaKind,
    durationMs: mediaKind === "video" ? 5000 : null,
    selectedAt,
    createdAt: now - 100,
    downloadUrl: `/api/generated-assets/${id}`,
  }
}

function task(
  id: string,
  targetId: string,
  status: GenerationTask["status"],
  createdAt: number,
): GenerationTask {
  return {
    id,
    projectId: "p1",
    targetType: "shot",
    targetId,
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "video",
    promptHash: "hash",
    status,
    error: status === "failed" ? "provider timeout" : null,
    assetId: status === "succeeded" ? `asset-${targetId}` : null,
    mediaKind: "video",
    batchId: "batch-1",
    estimatedCostMicros: 1_300_000,
    actualCostMicros: status === "succeeded" ? 1_300_000 : 0,
    createdAt,
    startedAt: createdAt + 1,
    finishedAt: status === "failed" ? createdAt + 2 : null,
  }
}

const assets = [
  asset("frame-1", "shot-1", "image", now - 10),
  asset("video-1", "shot-1", "video", now - 5),
  asset("frame-2", "shot-2", "image", now - 10),
]

const tasks = [
  task("video-task-2", "shot-2", "running", now - 20),
  task("video-task-3", "shot-3", "failed", now - 30),
]

test("视频就绪度区分缺首帧、缺视频、进行中和失败镜头", () => {
  const view = buildMobileVideoView({ shots, assets, tasks })

  assert.deepEqual(view.readiness, {
    totalShots: 3,
    frameReady: 2,
    videoReady: 1,
    missingFrame: 1,
    missingVideo: 2,
    activeTasks: 1,
    failedTasks: 1,
  })
  assert.equal(view.targets.length, 3)
  assert.equal(view.targets[0].selectedFrameAssetId, "frame-1")
  assert.equal(view.targets[0].selectedVideoAssetId, "video-1")
  assert.equal(view.targets[2].selectedFrameAssetId, null)
  assert.match(view.targets[2].blockedReason ?? "", /首帧/)
})

test("Mobile Context 携带图片/视频媒体任务、批次和视频能力", () => {
  const videoCapabilities = getPublicVideoCapabilities({
    VIDEO_GENERATION_ENABLED: "1",
    MINIMAX_API_KEY: "secret",
    MINIMAX_VIDEO_MODEL: "MiniMax-H3-Lite",
    MINIMAX_VIDEO_RESOLUTION: "768P",
  })
  const imageTask = {
    ...task("image-task", "shot-1", "succeeded", now - 50),
    providerId: "aliyun",
    model: "wanx",
    mediaKind: "image" as const,
    batchId: null,
  }
  const context = buildMobileContext({
    projects,
    snapshots: { shots },
    quota: { remaining: 20, limit: 65, used: 45, projectsLeft: 1 },
    now,
    activeProjectId: "p1",
    tasks: [imageTask, ...tasks],
    assets,
    batches: [{
      id: "batch-1",
      projectId: "p1",
      episode: 1,
      scope: { shotIds: ["shot-2", "shot-3"] },
      status: "running",
      budgetLimitMicros: 2_600_000,
      reservedCostMicros: 1_300_000,
      actualCostMicros: 0,
      idempotencyKey: "batch-key",
      createdAt: now - 30,
      confirmedAt: now - 30,
      finishedAt: null,
    }],
    videoCapabilities,
  })

  assert.equal(context.tasks.find((task) => task.id === "video-task-2")?.mediaKind, "video")
  assert.equal(context.tasks.find((task) => task.id === "video-task-2")?.batchId, "batch-1")
  assert.equal(context.batches.length, 1)
  assert.equal(context.videoCapabilities.defaultModel, "MiniMax-H3-Lite")
  assert.equal(context.videoReadiness.activeTasks, 1)
  assert.equal(JSON.stringify(context).includes("secret"), false)
})
