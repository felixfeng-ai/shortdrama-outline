import assert from "node:assert/strict"
import test from "node:test"

import { PATCH as patchGenerations } from "../app/api/generations/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  createGenerationTask,
  failGenerationTask,
  getGenerationTask,
  listGenerationTasks,
  markGenerationTaskRunning,
} from "../lib/generation/repo.ts"

const OWNER = `anon_${"t".repeat(48)}`
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])

function request(body: unknown) {
  return new Request("http://localhost/api/generations", {
    method: "PATCH",
    headers: {
      cookie: `chengju_sid=${OWNER}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

test("App 可停止运行中的生成任务", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "任务操作", OWNER)
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    providerId: "test",
    model: "test",
    prompt: "frame",
  })
  markGenerationTaskRunning(db, task.id)
  const response = await patchGenerations(request({
    action: "cancel",
    projectId: project.id,
    taskId: task.id,
  }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.data.task.status, "canceled")
  assert.equal(getGenerationTask(db, task.id)?.status, "canceled")
})

test("不能操作其他项目的任务", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "任务操作", `anon_${"x".repeat(48)}`)
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    providerId: "test",
    model: "test",
    prompt: "frame",
  })
  const response = await patchGenerations(request({
    action: "cancel",
    projectId: project.id,
    taskId: task.id,
  }))
  assert.equal(response.status, 403)
})

test("失败任务重试会创建新任务并保留旧记录", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "任务重试", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{ id: "shot-row-retry", entityId: "shot-retry", prompt: "retry frame" }],
  })
  const failed = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-retry",
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "retry frame",
  })
  markGenerationTaskRunning(db, failed.id)
  failGenerationTask(db, failed.id, "provider timeout")

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/image-synthesis")) {
      return Response.json({ output: { task_id: "retry-provider-task", task_status: "PENDING" } })
    }
    if (url.endsWith("/api/v1/tasks/retry-provider-task")) {
      return Response.json({
        output: {
          task_status: "SUCCEEDED",
          results: [{ url: "https://cdn.example.com/retry.png" }],
        },
      })
    }
    return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } })
  }) as typeof fetch
  process.env.ALIYUN_DASHSCOPE_API_KEY = "retry-test-key"
  process.env.ALIYUN_IMAGE_MODEL = "wanx2.1-t2i-turbo"

  try {
    const response = await patchGenerations(request({
      action: "retry",
      projectId: project.id,
      taskId: failed.id,
    }))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.data.task.status, "succeeded")
    assert.notEqual(payload.data.task.id, failed.id)
    assert.equal(getGenerationTask(db, failed.id)?.status, "failed")
    assert.equal(listGenerationTasks(db, project.id).length, 2)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ALIYUN_DASHSCOPE_API_KEY
    delete process.env.ALIYUN_IMAGE_MODEL
  }
})
