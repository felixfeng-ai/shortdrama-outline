import { test } from "node:test"
import assert from "node:assert/strict"

import {
  GET as getVideoGenerations,
  PATCH as patchVideoGenerations,
  POST as postVideoGenerations,
} from "../app/api/video/generations/route.ts"
import { POST as postBatchVideoGenerations } from "../app/api/video/generations/batch/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  getGenerationBatch,
  getGenerationTask,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"
import { writeGeneratedImage } from "../lib/generation/files.ts"

const OWNER = `anon_${"v".repeat(48)}`
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])
const MP4 = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
])

function headers(json = false, owner = OWNER): Headers {
  const result = new Headers({ cookie: `chengju_sid=${owner}` })
  if (json) result.set("content-type", "application/json")
  return result
}

function seedShotWithKeyframe() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "视频接口测试", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [
      {
        id: "shot-row-video",
        entityId: "shot-video-api",
        episode: 1,
        shot: 2,
        scene: "雨夜天台",
        prompt: "A woman turns toward the camera in the rain.",
        params: { ratio: "9:16", duration: 5, lastFrame: false },
      },
    ],
  })
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-video-api",
    providerId: "aliyun",
    model: "frame-model",
    prompt: "first frame",
    mediaKind: "image",
  })
  const file = writeGeneratedImage(project.id, "video-api-frame", PNG, "image/png")
  const image = saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-video-api",
    storageKey: file.storageKey,
    mime: "image/png",
    bytes: file.bytes,
    providerId: "aliyun",
    model: "frame-model",
    prompt: "first frame",
    mediaKind: "image",
  })
  completeGenerationTask(db, task.id, image.id)
  selectGeneratedAsset(db, project.id, image.id)
  return { db, project, image }
}

function addSelectedFrame(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  targetId: string,
  name: string,
) {
  const task = createGenerationTask(db, {
    projectId,
    targetType: "shot",
    targetId,
    providerId: "aliyun",
    model: "frame-model",
    prompt: `${targetId} frame`,
    mediaKind: "image",
  })
  const file = writeGeneratedImage(projectId, name, PNG, "image/png")
  const asset = saveGeneratedAsset(db, {
    taskId: task.id,
    projectId,
    targetType: "shot",
    targetId,
    storageKey: file.storageKey,
    mime: "image/png",
    bytes: file.bytes,
    providerId: "aliyun",
    model: "frame-model",
    prompt: `${targetId} frame`,
    mediaKind: "image",
  })
  completeGenerationTask(db, task.id, asset.id)
  selectGeneratedAsset(db, projectId, asset.id)
  return asset
}

function setVideoEnv() {
  process.env.VIDEO_GENERATION_ENABLED = "1"
  process.env.MINIMAX_API_KEY = "server-video-test-key"
  process.env.MINIMAX_VIDEO_MODEL = "MiniMax-H3-Lite"
  process.env.MINIMAX_VIDEO_RESOLUTION = "768P"
}

function clearVideoEnv() {
  delete process.env.VIDEO_GENERATION_ENABLED
  delete process.env.MINIMAX_API_KEY
  delete process.env.MINIMAX_VIDEO_MODEL
  delete process.env.MINIMAX_VIDEO_RESOLUTION
}

test("P0-V2 提交视频任务后立即返回，轮询成功再落盘候选", async () => {
  const { db, project, image } = seedShotWithKeyframe()
  setVideoEnv()
  const originalFetch = globalThis.fetch
  let submittedBody: Record<string, unknown> | null = null
  let submitCount = 0

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/v2/video_generation")) {
      submitCount += 1
      submittedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      return Response.json({ task_id: "minimax-task-1" })
    }
    if (url.endsWith("/v2/query/video_generation/minimax-task-1")) {
      return Response.json({
        task: {
          id: "minimax-task-1",
          status: "succeeded",
          content: { url: "https://cdn.example.com/video.mp4" },
          duration: 5,
          resolution: "768P",
          ratio: "9:16",
        },
      })
    }
    if (url === "https://cdn.example.com/video.mp4") {
      return new Response(MP4, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch

  try {
    const created = await postVideoGenerations(new Request("http://localhost/api/video/generations", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        projectId: project.id,
        targetId: "shot-video-api",
        sourceAssetId: image.id,
        prompt: "She slowly turns toward the camera.",
        mode: "image-to-video",
        model: "MiniMax-H3-Lite",
        resolution: "768P",
        duration: 5,
        ratio: "9:16",
        maxBudgetMicros: 5_000_000,
        idempotencyKey: "video-api-idem-1",
      }),
    }))
    const createdPayload = await created.json()

    assert.equal(created.status, 200)
    assert.equal(createdPayload.data.task.status, "running")
    assert.equal(createdPayload.data.task.mediaKind, "video")
    assert.equal(createdPayload.data.task.providerTaskId, "minimax-task-1")
    assert.equal(createdPayload.data.task.estimatedCostMicros, 1_300_000)
    assert.equal(submitCount, 1)
    assert.ok(submittedBody)
    const sent = submittedBody as Record<string, unknown>
    assert.equal(sent.model, "MiniMax-H3-Lite")
    assert.equal(sent.resolution, "768P")
    assert.equal(sent.duration, 5)
    assert.equal(sent.ratio, "adaptive")
    assert.equal(JSON.stringify(sent).includes("generated/"), false)

    const polled = await getVideoGenerations(new Request(
      `http://localhost/api/video/generations?projectId=${project.id}`,
      { headers: headers() },
    ))
    const polledPayload = await polled.json()
    assert.equal(polled.status, 200)
    assert.equal(polledPayload.data.tasks[0].status, "succeeded")
    assert.equal(polledPayload.data.assets.length, 1)
    assert.equal(polledPayload.data.assets[0].mediaKind, "video")
    assert.equal(polledPayload.data.assets[0].mime, "video/mp4")
    assert.equal(polledPayload.data.assets[0].durationMs, 5000)
    assert.equal(polledPayload.data.assets[0].sourceAssetIds[0], image.id)
    assert.equal(polledPayload.data.batches.length, 1)
    assert.equal(polledPayload.data.batches[0].status, "completed")
    assert.equal(polledPayload.data.batches[0].reservedCostMicros, 0)
    assert.equal(polledPayload.data.batches[0].actualCostMicros, 1_300_000)
    assert.equal(getGenerationBatch(db, createdPayload.data.batch.id)?.status, "completed")

    const selected = await patchVideoGenerations(new Request("http://localhost/api/video/generations", {
      method: "PATCH",
      headers: headers(true),
      body: JSON.stringify({
        projectId: project.id,
        action: "select",
        assetId: polledPayload.data.assets[0].id,
      }),
    }))
    assert.equal(selected.status, 200)
    assert.ok(getGenerationTask(db, createdPayload.data.task.id)?.assetId)
  } finally {
    globalThis.fetch = originalFetch
    clearVideoEnv()
  }
})

test("P0-V2 相同幂等键不会重复提交供应商", async () => {
  const { project, image } = seedShotWithKeyframe()
  setVideoEnv()
  const originalFetch = globalThis.fetch
  let submitCount = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/v2/video_generation")) {
      submitCount += 1
      return Response.json({ task_id: `minimax-task-${submitCount}` })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch

  const body = JSON.stringify({
    projectId: project.id,
    targetId: "shot-video-api",
    sourceAssetId: image.id,
    prompt: "Slow push in.",
    resolution: "768P",
    duration: 5,
    idempotencyKey: "same-video-request",
  })

  try {
    const first = await postVideoGenerations(new Request("http://localhost/api/video/generations", {
      method: "POST",
      headers: headers(true),
      body,
    }))
    const firstPayload = await first.json()
    const second = await postVideoGenerations(new Request("http://localhost/api/video/generations", {
      method: "POST",
      headers: headers(true),
      body,
    }))
    const secondPayload = await second.json()

    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(firstPayload.data.task.id, secondPayload.data.task.id)
    assert.equal(submitCount, 1)
  } finally {
    globalThis.fetch = originalFetch
    clearVideoEnv()
  }
})

test("P0-V3 懒对账收敛供应商运行、取消和失败状态", async () => {
  const { db, project } = seedShotWithKeyframe()
  const running = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-video-api",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "running",
    mediaKind: "video",
    providerTaskId: "query-running",
    providerStatus: "queued",
    nextPollAt: 0,
  })
  const canceled = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-video-api",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "canceled",
    mediaKind: "video",
    providerTaskId: "query-canceled",
    providerStatus: "queued",
    nextPollAt: 0,
  })
  const failed = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-video-api",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "failed",
    mediaKind: "video",
    providerTaskId: "query-failed",
    providerStatus: "queued",
    nextPollAt: 0,
  })
  setVideoEnv()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/query-running")) {
      return Response.json({ task: { status: "running" } })
    }
    if (url.endsWith("/query-canceled")) {
      return Response.json({ task: { status: "canceled" } })
    }
    if (url.endsWith("/query-failed")) {
      return Response.json({
        task: {
          status: "failed",
          error: { code: "sensitive", message: "content rejected" },
        },
      })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch

  try {
    const response = await getVideoGenerations(new Request(
      `http://localhost/api/video/generations?projectId=${project.id}`,
      { headers: headers() },
    ))
    const payload = await response.json()
    const byId = new Map(
      payload.data.tasks.map((task: { id: string; status: string; error: string | null }) => [
        task.id,
        task,
      ]),
    )

    assert.equal(response.status, 200)
    assert.equal((byId.get(running.id) as { status: string }).status, "running")
    assert.equal((byId.get(canceled.id) as { status: string }).status, "canceled")
    assert.equal((byId.get(failed.id) as { status: string }).status, "failed")
    assert.equal((byId.get(failed.id) as { error: string }).error, "content rejected")
  } finally {
    globalThis.fetch = originalFetch
    clearVideoEnv()
  }
})

test("P0-V2 超过预算时在调用供应商前拒绝", async () => {
  const { project, image } = seedShotWithKeyframe()
  setVideoEnv()
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => {
    called = true
    return Response.json({ task_id: "unexpected" })
  }) as typeof fetch

  try {
    const response = await postVideoGenerations(new Request("http://localhost/api/video/generations", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        projectId: project.id,
        targetId: "shot-video-api",
        sourceAssetId: image.id,
        prompt: "Slow push in.",
        resolution: "768P",
        duration: 10,
        maxBudgetMicros: 2_000_000,
      }),
    }))
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.match(payload.error, /超过本次预算/)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
    clearVideoEnv()
  }
})

test("P0-V2 供应商限流映射为 503 并保留重试间隔", async () => {
  const { project, image } = seedShotWithKeyframe()
  setVideoEnv()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ error: { message: "rate limit" } }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "17",
      },
    },
  )) as typeof fetch

  try {
    const response = await postVideoGenerations(new Request(
      "http://localhost/api/video/generations",
      {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
          projectId: project.id,
          targetId: "shot-video-api",
          sourceAssetId: image.id,
          prompt: "Slow push in.",
          resolution: "768P",
          duration: 5,
        }),
      },
    ))
    assert.equal(response.status, 503)
    assert.equal(response.headers.get("retry-after"), "17")
  } finally {
    globalThis.fetch = originalFetch
    clearVideoEnv()
  }
})

test("P0-V4 批量视频只提交准备完成的镜头，并按批次幂等", async () => {
  const { db, project, image } = seedShotWithKeyframe()
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [
      {
        id: "shot-row-video",
        entityId: "shot-video-api",
        episode: 1,
        shot: 1,
        scene: "雨夜天台",
        prompt: "First shot.",
        params: { ratio: "9:16", duration: 5, lastFrame: false },
      },
      {
        id: "shot-row-video-2",
        entityId: "shot-video-api-2",
        episode: 1,
        shot: 2,
        scene: "走廊",
        prompt: "Second shot.",
        params: { ratio: "9:16", duration: 10, lastFrame: false },
      },
      {
        id: "shot-row-video-3",
        entityId: "shot-video-api-3",
        episode: 1,
        shot: 3,
        scene: "门口",
        prompt: "Missing frame shot.",
        params: { ratio: "9:16", duration: 5, lastFrame: false },
      },
    ],
  })
  const secondFrameTask = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-video-api-2",
    providerId: "aliyun",
    model: "frame-model",
    prompt: "second frame",
    mediaKind: "image",
  })
  const secondFrameFile = writeGeneratedImage(
    project.id,
    "video-api-frame-2",
    PNG,
    "image/png",
  )
  const secondFrame = saveGeneratedAsset(db, {
    taskId: secondFrameTask.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-video-api-2",
    storageKey: secondFrameFile.storageKey,
    mime: "image/png",
    bytes: secondFrameFile.bytes,
    providerId: "aliyun",
    model: "frame-model",
    prompt: "second frame",
    mediaKind: "image",
  })
  completeGenerationTask(db, secondFrameTask.id, secondFrame.id)
  selectGeneratedAsset(db, project.id, secondFrame.id)
  setVideoEnv()
  const originalFetch = globalThis.fetch
  let submitCount = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/v2/video_generation")) {
      submitCount += 1
      return Response.json({ task_id: `batch-task-${submitCount}` })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch

  const body = JSON.stringify({
    projectId: project.id,
    shots: [
      {
        targetId: "shot-video-api",
        sourceAssetId: image.id,
        prompt: "First shot.",
        duration: 5,
        ratio: "9:16",
      },
      {
        targetId: "shot-video-api-2",
        sourceAssetId: secondFrame.id,
        prompt: "Second shot.",
        duration: 10,
        ratio: "9:16",
      },
      {
        targetId: "shot-video-api-3",
        prompt: "Missing frame shot.",
        duration: 5,
        ratio: "9:16",
      },
    ],
    model: "MiniMax-H3-Lite",
    resolution: "768P",
    budgetLimitMicros: 5_000_000,
    idempotencyKey: "batch-idem-1",
  })

  try {
    const first = await postBatchVideoGenerations(new Request(
      "http://localhost/api/video/generations/batch",
      { method: "POST", headers: headers(true), body },
    ))
    const firstPayload = await first.json()
    assert.equal(first.status, 200)
    assert.equal(firstPayload.data.tasks.length, 2)
    assert.equal(firstPayload.data.blocked.length, 1)
    assert.equal(firstPayload.data.blocked[0].targetId, "shot-video-api-3")
    assert.equal(firstPayload.data.batch.status, "running")
    assert.equal(firstPayload.data.batch.reservedCostMicros, 3_900_000)
    assert.equal(firstPayload.data.batch.actualCostMicros, 0)
    assert.equal(submitCount, 2)

    const repeated = await postBatchVideoGenerations(new Request(
      "http://localhost/api/video/generations/batch",
      { method: "POST", headers: headers(true), body },
    ))
    const repeatedPayload = await repeated.json()
    assert.equal(repeated.status, 200)
    assert.deepEqual(
      repeatedPayload.data.tasks.map((task: { id: string }) => task.id),
      firstPayload.data.tasks.map((task: { id: string }) => task.id),
    )
    assert.equal(submitCount, 2)
    const count = getDbForRequest()
      .prepare("SELECT COUNT(*) AS count FROM generation_tasks WHERE project_id = ? AND media_kind = 'video'")
      .get(project.id) as { count: number }
    assert.equal(count.count, 2)
  } finally {
    globalThis.fetch = originalFetch
    clearVideoEnv()
  }
})

test("P0-V4d 批量视频低并发提交，单项失败不阻断并单独返回失败原因", async () => {
  const { db, project, image } = seedShotWithKeyframe()
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [
      {
        id: "shot-row-video",
        entityId: "shot-video-api",
        episode: 1,
        shot: 1,
        scene: "雨夜天台",
        prompt: "First shot.",
        params: { ratio: "9:16", duration: 5, lastFrame: false },
      },
      {
        id: "shot-row-video-2",
        entityId: "shot-video-api-2",
        episode: 1,
        shot: 2,
        scene: "走廊",
        prompt: "Second shot.",
        params: { ratio: "9:16", duration: 10, lastFrame: false },
      },
    ],
  })
  const secondFrame = addSelectedFrame(
    db,
    project.id,
    "shot-video-api-2",
    "video-api-concurrent-frame-2",
  )
  setVideoEnv()
  const originalFetch = globalThis.fetch
  let submitCount = 0
  let active = 0
  let maxActive = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (!url.endsWith("/v2/video_generation")) {
      throw new Error(`unexpected fetch ${url}`)
    }
    const index = submitCount
    submitCount += 1
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, 25))
    active -= 1
    if (index === 0) {
      return Response.json(
        { error: { message: "temporary unavailable" } },
        { status: 500 },
      )
    }
    return Response.json({ task_id: "concurrent-video-task" })
  }) as typeof fetch

  try {
    const response = await postBatchVideoGenerations(new Request(
      "http://localhost/api/video/generations/batch",
      {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
          projectId: project.id,
          shots: [
            {
              targetId: "shot-video-api",
              sourceAssetId: image.id,
              prompt: "First shot.",
              duration: 5,
              ratio: "9:16",
            },
            {
              targetId: "shot-video-api-2",
              sourceAssetId: secondFrame.id,
              prompt: "Second shot.",
              duration: 10,
              ratio: "9:16",
            },
          ],
          model: "MiniMax-H3-Lite",
          resolution: "768P",
          budgetLimitMicros: 5_000_000,
          idempotencyKey: "batch-concurrent-partial-failure",
        }),
      },
    ))
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(submitCount, 2)
    assert.equal(maxActive, 2)
    assert.equal(payload.data.tasks.length, 1)
    assert.equal(payload.data.failures.length, 1)
    assert.equal(payload.data.failures[0].targetId, "shot-video-api")
    assert.match(payload.data.failures[0].reason, /平台视频服务请求失败/)
    assert.equal(payload.data.batch.status, "running")
    assert.equal(payload.data.batch.reservedCostMicros, 2_600_000)
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM generation_tasks WHERE project_id = ? AND media_kind = 'video'")
      .get(project.id) as { count: number }
    assert.equal(count.count, 2)
  } finally {
    globalThis.fetch = originalFetch
    clearVideoEnv()
  }
})

test("P0-V4b 批量预算不足时不提交任何镜头", async () => {
  const { project, image } = seedShotWithKeyframe()
  setVideoEnv()
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => {
    called = true
    return Response.json({ task_id: "unexpected" })
  }) as typeof fetch

  try {
    const response = await postBatchVideoGenerations(new Request(
      "http://localhost/api/video/generations/batch",
      {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
          projectId: project.id,
          shots: [{
            targetId: "shot-video-api",
            sourceAssetId: image.id,
            prompt: "First shot.",
            duration: 10,
            ratio: "9:16",
          }],
          model: "MiniMax-H3-Lite",
          resolution: "768P",
          budgetLimitMicros: 1_000_000,
          idempotencyKey: "batch-budget-too-low",
        }),
      },
    ))
    assert.equal(response.status, 400)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
    clearVideoEnv()
  }
})

test("P0-V4c 失败视频任务可以重试，旧任务保留", async () => {
  const { project, image } = seedShotWithKeyframe()
  setVideoEnv()
  const originalFetch = globalThis.fetch
  let submitCount = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/v2/video_generation")) {
      submitCount += 1
      if (submitCount === 1) {
        return Response.json({ error: { message: "temporary unavailable" } }, { status: 500 })
      }
      return Response.json({ task_id: "retry-task-1" })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch

  try {
    const failed = await postVideoGenerations(new Request("http://localhost/api/video/generations", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        projectId: project.id,
        targetId: "shot-video-api",
        sourceAssetId: image.id,
        prompt: "Retry this shot.",
        resolution: "768P",
        duration: 5,
        idempotencyKey: "initial-failing-task",
      }),
    }))
    assert.equal(failed.status, 502)
    const failedTask = getDbForRequest()
      .prepare("SELECT * FROM generation_tasks WHERE idempotency_key = ?")
      .get("initial-failing-task") as { id: string; status: string }
    assert.equal(failedTask.status, "failed")

    const retried = await patchVideoGenerations(new Request("http://localhost/api/video/generations", {
      method: "PATCH",
      headers: headers(true),
      body: JSON.stringify({
        projectId: project.id,
        action: "retry",
        taskId: failedTask.id,
      }),
    }))
    const retriedPayload = await retried.json()
    assert.equal(retried.status, 200)
    assert.equal(retriedPayload.data.task.status, "running")
    assert.equal(retriedPayload.data.task.retryOfTaskId, failedTask.id)
    assert.equal(retriedPayload.data.task.providerTaskId, "retry-task-1")
    assert.equal(submitCount, 2)
  } finally {
    globalThis.fetch = originalFetch
    clearVideoEnv()
  }
})
