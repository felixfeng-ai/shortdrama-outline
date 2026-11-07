import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  completeGenerationTask,
  createGenerationBatch,
  createGenerationTask,
  getGenerationBatch,
  getGenerationTask,
  saveGeneratedAsset,
} from "../lib/generation/repo.ts"
import {
  cancelImageBatch,
  enqueueImageBatch,
  getImageBatchState,
  pauseImageBatch,
  resumeImageBatch,
  retryFailedImageBatch,
  retryFailedImageTask,
  setImageBatchPriority,
} from "../lib/generation/image-batch.ts"
import { runImageQueueTick } from "../lib/generation/image-queue.ts"
import { generateKeyframe } from "../lib/generation/client.ts"

const OWNER = `anon_${"q".repeat(48)}`
const LOOK = { palette: "", light: "", lens: "", banned: "" }

function seedPlaceProject(db: ReturnType<typeof openDb>) {
  const project = createProject(db, "队列项目", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualPlaces",
    payload: [
      { id: "place-a", name: "码头", entityId: "place-a" },
      { id: "place-b", name: "仓库", entityId: "place-b" },
      { id: "place-c", name: "办公室", entityId: "place-c" },
    ],
  })
  return project
}

function target(key: string) {
  return {
    key,
    name: key,
    targetType: "place" as const,
    targetId: key,
    prompt: `${key} empty room`,
    aspect: "landscape" as const,
  }
}

test("IQ1 generation batch persists image queue metadata", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "队列项目", OWNER)
    const batch = createGenerationBatch(db, {
      projectId: project.id,
      episode: 1,
      scope: { kind: "image", targetCount: 18 },
      mediaKind: "image",
      priority: 7,
      concurrency: 3,
      idempotencyKey: "queue-metadata",
    })
    assert.equal(batch.mediaKind, "image")
    assert.equal(batch.priority, 7)
    assert.equal(batch.concurrency, 3)
    assert.equal(batch.pausedAt, null)

    const task = createGenerationTask(db, {
      projectId: project.id,
      targetType: "place",
      targetId: "place-1",
      providerId: "aliyun",
      model: "wanx2.1-t2i-turbo",
      prompt: "empty room",
      mediaKind: "image",
      batchId: batch.id,
      maxAttempts: 3,
      request: { aspect: "landscape", batchKey: "place-1" },
      idempotencyKey: "queue-task-1",
    })
    assert.equal(task.batchId, batch.id)
    assert.equal(task.maxAttempts, 3)
    assert.equal(getGenerationTask(db, task.id)?.request?.batchKey, "place-1")
  } finally {
    db.close()
  }
})

test("IQ2 image production queue has durable batch API worker and pause endpoints", () => {
  const required = [
    "app/api/generation-batches/image/route.ts",
    "app/api/generation-batches/[batchId]/route.ts",
    "lib/generation/image-batch.ts",
    "lib/generation/image-queue.ts",
    "lib/generation/image-runner.ts",
  ]
  for (const path of required) {
    assert.equal(fs.existsSync(path), true, `缺少 ${path}`)
  }

  const createRoute = fs.readFileSync("app/api/generation-batches/image/route.ts", "utf8")
  const batchRoute = fs.readFileSync("app/api/generation-batches/[batchId]/route.ts", "utf8")
  assert.match(createRoute, /enqueueImageBatch/)
  assert.match(createRoute, /ensureImageQueueWorker/)
  assert.match(batchRoute, /pauseImageBatch/)
  assert.match(batchRoute, /resumeImageBatch/)
  assert.match(batchRoute, /retryFailedImageBatch/)
})

test("IQ3 batch panel uses server queue instead of per-image synchronous loop", () => {
  const store = fs.readFileSync("lib/generation/batch-store.ts", "utf8")
  const client = fs.readFileSync("lib/generation/client.ts", "utf8")
  const panel = fs.readFileSync("components/BatchGenerationPanel.tsx", "utf8")
  assert.match(store, /createImageGenerationBatch/)
  assert.match(store, /fetchImageGenerationBatch/)
  assert.match(store, /poll/)
  assert.match(client, /generation-batches\/image/)
  assert.match(panel, /暂停批次/)
  assert.match(panel, /恢复批次/)
  assert.match(panel, /预计剩余/)
})

test("IQ4 image limits count batches, retry transient upstream errors and expose provider concurrency config", () => {
  const limits = fs.readFileSync("lib/security/api-rate-limit.ts", "utf8")
  const worker = fs.readFileSync("lib/generation/image-queue.ts", "utf8")
  const env = fs.readFileSync(".env.example", "utf8")
  assert.match(limits, /API_IMAGE_IDENTITY_10M_LIMIT[^\n]*fallback:\s*60/s)
  assert.match(worker, /retryAfterSeconds/)
  assert.match(worker, /IMAGE_QUEUE_CONCURRENCY/)
  assert.match(worker, /IMAGE_MODEL_CONCURRENCY_JSON/)
  assert.match(env, /IMAGE_QUEUE_CONCURRENCY/)
  assert.match(env, /IMAGE_MODEL_CONCURRENCY_JSON/)
})

test("IQ5 enqueue persists targets and worker runs the server queue", async () => {
  const previous = process.env.UNLIMITED_QUOTA_ACCOUNTS
  process.env.UNLIMITED_QUOTA_ACCOUNTS = OWNER
  const db = openDb(":memory:")
  try {
    const project = seedPlaceProject(db)
    const state = enqueueImageBatch(db, {
      projectId: project.id,
      identity: OWNER,
      targets: [target("place-a"), target("place-b"), target("place-c")],
      look: LOOK,
      idempotencyKey: "server-queue-batch",
      concurrency: 2,
    })
    assert.equal(state.counts.total, 3)
    assert.equal(state.counts.queued, 3)

    const run = async (dbRef: typeof db, task: ReturnType<typeof getGenerationTask> & {}) => {
      const asset = saveGeneratedAsset(dbRef, {
        taskId: task.id,
        projectId: task.projectId,
        targetType: task.targetType,
        targetId: task.targetId,
        storageKey: `${task.id}.png`,
        mime: "image/png",
        bytes: 1,
        providerId: "aliyun",
        model: "test-image",
        prompt: task.prompt,
      })
      completeGenerationTask(dbRef, task.id, asset.id)
    }
    assert.equal(await runImageQueueTick(db, { runner: run, concurrency: 2 }), 2)
    assert.equal(await runImageQueueTick(db, { runner: run, concurrency: 2 }), 1)
    const finished = getImageBatchState(db, state.batch.id, project.id)
    assert.equal(finished.counts.succeeded, 3)
    assert.equal(finished.batch.status, "completed")
  } finally {
    db.close()
    if (previous === undefined) delete process.env.UNLIMITED_QUOTA_ACCOUNTS
    else process.env.UNLIMITED_QUOTA_ACCOUNTS = previous
  }
})

test("IQ6 paused and higher-priority batches obey queue ordering", async () => {
  const previous = process.env.UNLIMITED_QUOTA_ACCOUNTS
  process.env.UNLIMITED_QUOTA_ACCOUNTS = OWNER
  const db = openDb(":memory:")
  try {
    const project = seedPlaceProject(db)
    const paused = enqueueImageBatch(db, {
      projectId: project.id,
      identity: OWNER,
      targets: [target("place-a")],
      look: LOOK,
      idempotencyKey: "paused-batch",
      priority: 100,
    })
    pauseImageBatch(db, paused.batch.id, project.id)
    const normal = enqueueImageBatch(db, {
      projectId: project.id,
      identity: OWNER,
      targets: [target("place-b")],
      look: LOOK,
      idempotencyKey: "normal-batch",
      priority: 0,
    })
    const priority = enqueueImageBatch(db, {
      projectId: project.id,
      identity: OWNER,
      targets: [target("place-c")],
      look: LOOK,
      idempotencyKey: "priority-batch",
      priority: 10,
    })
    const claimed: string[] = []
    await runImageQueueTick(db, {
      concurrency: 1,
      runner: async (dbRef, task) => {
        claimed.push(task.targetId)
        const asset = saveGeneratedAsset(dbRef, {
          taskId: task.id,
          projectId: task.projectId,
          targetType: task.targetType,
          targetId: task.targetId,
          storageKey: `${task.id}.png`,
          mime: "image/png",
          bytes: 1,
          providerId: "aliyun",
          model: "test-image",
          prompt: task.prompt,
        })
        completeGenerationTask(dbRef, task.id, asset.id)
      },
    })
    assert.deepEqual(claimed, ["place-c"])
    assert.equal(getImageBatchState(db, paused.batch.id).counts.queued, 1)
    assert.equal(getImageBatchState(db, normal.batch.id).counts.queued, 1)
    assert.equal(priority.batch.id.length > 0, true)
  } finally {
    db.close()
    if (previous === undefined) delete process.env.UNLIMITED_QUOTA_ACCOUNTS
    else process.env.UNLIMITED_QUOTA_ACCOUNTS = previous
  }
})

test("IQ7 transient provider 429 requeues instead of failing the task", async () => {
  const previous = process.env.UNLIMITED_QUOTA_ACCOUNTS
  process.env.UNLIMITED_QUOTA_ACCOUNTS = OWNER
  const db = openDb(":memory:")
  try {
    const project = seedPlaceProject(db)
    const queued = enqueueImageBatch(db, {
      projectId: project.id,
      identity: OWNER,
      targets: [target("place-a")],
      look: LOOK,
      idempotencyKey: "retry-batch",
    })
    const taskId = getImageBatchState(db, queued.batch.id).items[0].taskId
    await runImageQueueTick(db, {
      concurrency: 1,
      runner: async () => {
        throw Object.assign(new Error("429 rate limit"), {
          status: 429,
          retryAfterSeconds: 1,
        })
      },
    })
    const retried = getGenerationTask(db, taskId)
    assert.equal(retried?.status, "queued")
    assert.equal(retried?.attempt, 2)
    assert.ok((retried?.nextPollAt ?? 0) > Date.now())
  } finally {
    db.close()
    if (previous === undefined) delete process.env.UNLIMITED_QUOTA_ACCOUNTS
    else process.env.UNLIMITED_QUOTA_ACCOUNTS = previous
  }
})

test("IQ8 image batch mutations are scoped to the requesting project", () => {
  const previous = process.env.UNLIMITED_QUOTA_ACCOUNTS
  process.env.UNLIMITED_QUOTA_ACCOUNTS = OWNER
  const db = openDb(":memory:")
  try {
    const project = seedPlaceProject(db)
    const otherProject = createProject(db, "另一个项目", OWNER)
    const queued = enqueueImageBatch(db, {
      projectId: project.id,
      identity: OWNER,
      targets: [target("place-a")],
      look: LOOK,
      idempotencyKey: "project-scope-batch",
    })

    assert.throws(
      () => pauseImageBatch(db, queued.batch.id, otherProject.id),
      /不属于当前项目/,
    )
    assert.throws(
      () => resumeImageBatch(db, queued.batch.id, otherProject.id),
      /不属于当前项目/,
    )
    assert.throws(
      () => cancelImageBatch(db, queued.batch.id, "test cancel", otherProject.id),
      /不属于当前项目/,
    )
    assert.throws(
      () => retryFailedImageBatch(db, queued.batch.id, OWNER, otherProject.id),
      /不属于当前项目/,
    )
    assert.throws(
      () => retryFailedImageTask(db, queued.batch.id, OWNER, "place-a", otherProject.id),
      /不属于当前项目/,
    )
    assert.throws(
      () => setImageBatchPriority(db, queued.batch.id, 10, otherProject.id),
      /不属于当前项目/,
    )
  } finally {
    db.close()
    if (previous === undefined) delete process.env.UNLIMITED_QUOTA_ACCOUNTS
    else process.env.UNLIMITED_QUOTA_ACCOUNTS = previous
  }
})

test("IQ9 image rate limit is presented as batch submissions, not image count", () => {
  const panel = fs.readFileSync("components/BatchGenerationPanel.tsx", "utf8")
  assert.match(panel, /还可提交[^\n]*个批次/)
  assert.match(panel, /available === 0/)
  assert.doesNotMatch(panel, /selectedTargets\.length > liveRateLimitRemaining/)
  assert.doesNotMatch(panel, /items\.length > available/)
})

test("IQ10 deploy writes production quota and image queue limits", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8")
  const applyEnv = fs.readFileSync("scripts/apply-deploy-env.mjs", "utf8")
  const expected = {
    CHENGJU_DAILY_UNITS: "300",
    API_IMAGE_IP_10M_LIMIT: "120",
    API_IMAGE_IDENTITY_10M_LIMIT: "60",
    API_IMAGE_GLOBAL_DAILY_LIMIT: "2000",
    IMAGE_AVERAGE_SECONDS: "45",
  }

  for (const [name, value] of Object.entries(expected)) {
    assert.match(workflow, new RegExp(`${name}: "${value}"`))
    assert.match(applyEnv, new RegExp(`${name}: process\\.env\\.${name}`))
  }
})

test("IQ11 server startup resumes the durable image worker", () => {
  assert.equal(fs.existsSync("instrumentation.ts"), true)
  assert.equal(fs.existsSync("instrumentation-node.ts"), true)
  const instrumentation = fs.readFileSync("instrumentation.ts", "utf8")
  const nodeBootstrap = fs.readFileSync("instrumentation-node.ts", "utf8")
  assert.match(instrumentation, /NEXT_RUNTIME === 'nodejs'/)
  assert.match(instrumentation, /instrumentation-node/)
  assert.match(nodeBootstrap, /ensureImageQueueWorker/)
  assert.match(nodeBootstrap, /getDbForRequest/)
})

test("IQ12 single keyframe generation enters the durable image queue", async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  const createdAt = Date.now()
  const batch = {
    id: "batch-single",
    projectId: "project-single",
    episode: 0,
    scope: { kind: "image", targetCount: 1 },
    mediaKind: "image",
    status: "completed",
    budgetLimitMicros: 0,
    reservedCostMicros: 0,
    actualCostMicros: 0,
    priority: 0,
    concurrency: 2,
    pausedAt: null,
    idempotencyKey: "single-key",
    createdAt,
    confirmedAt: createdAt,
    finishedAt: createdAt,
  }
  const asset = {
    id: "asset-single",
    taskId: "task-single",
    projectId: "project-single",
    targetType: "character",
    targetId: "character-single",
    storageKey: "single.png",
    mime: "image/png",
    bytes: 1,
    providerId: "aliyun",
    model: "test-image",
    prompt: "portrait",
    mediaKind: "image",
    selectedAt: null,
    createdAt,
    downloadUrl: "/api/generated-assets/asset-single",
  }
  const task = {
    id: "task-single",
    projectId: "project-single",
    targetType: "character",
    targetId: "character-single",
    providerId: "aliyun",
    model: "test-image",
    prompt: "portrait",
    promptHash: "hash",
    status: "succeeded",
    error: null,
    assetId: asset.id,
    batchId: batch.id,
    mediaKind: "image",
    createdAt,
    startedAt: createdAt,
    finishedAt: createdAt,
  }
  const imageState = {
    batch,
    counts: { total: 1, queued: 0, running: 0, succeeded: 1, failed: 0, canceled: 0 },
    queuePosition: 0,
    estimatedSeconds: 0,
    items: [{
      taskId: task.id,
      key: "single:character:character-single",
      name: "角色",
      targetType: "character",
      targetId: "character-single",
      status: "succeeded",
      error: null,
      attempt: 1,
      maxAttempts: 3,
      nextPollAt: null,
      asset,
    }],
  }

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    calls.push(`${init?.method ?? "GET"} ${url}`)
    if (url.includes("/api/generation-batches/image")) {
      return new Response(JSON.stringify({ success: true, data: imageState, error: null }))
    }
    if (url.includes("/api/generations")) {
      return new Response(JSON.stringify({
        success: true,
        data: { tasks: [task], assets: [asset] },
        error: null,
      }))
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }

  try {
    const result = await generateKeyframe({
      projectId: "project-single",
      targetType: "character",
      targetId: "character-single",
      prompt: "portrait",
      aspect: "portrait",
      autoSelect: false,
    })
    assert.equal(result.asset.id, "asset-single")
    assert.equal(result.task.id, "task-single")
    assert.match(calls[0], /^POST .*\/api\/generation-batches\/image$/)
    assert.ok(calls.some((call) => call.startsWith("GET ") && call.includes("/api/generations?")))
  } finally {
    globalThis.fetch = originalFetch
  }
})
