import { test } from "node:test"
import assert from "node:assert/strict"

import { GET as getGenerations, PATCH as patchGenerations, POST as postGenerations } from "../app/api/generations/route.ts"
import { GET as getGeneratedAsset } from "../app/api/generated-assets/[id]/route.ts"
import { DELETE as deleteProjectRoute } from "../app/api/projects/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"
import { writeGeneratedImage } from "../lib/generation/files.ts"
import fs from "node:fs"
import { resolveGeneratedStoragePath } from "../lib/generation/files.ts"

const OWNER_A = `anon_${"a".repeat(48)}`
const OWNER_B = `anon_${"b".repeat(48)}`
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02])

function headers(owner: string, json = false): Headers {
  const result = new Headers({ cookie: `chengju_sid=${owner}` })
  if (json) result.set("content-type", "application/json")
  return result
}

function seedAsset(owner = OWNER_A) {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "接口测试", owner)
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    providerId: "openai",
    model: "gpt-image-1",
    prompt: "first frame",
  })
  const assetId = `asset-${Date.now()}`
  const file = writeGeneratedImage(project.id, assetId, PNG, "image/png")
  const asset = saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    storageKey: file.storageKey,
    mime: "image/png",
    bytes: file.bytes,
    providerId: "openai",
    model: "gpt-image-1",
    prompt: "first frame",
  })
  completeGenerationTask(db, task.id, asset.id)
  return { db, project, task, asset }
}

test("G3.3 生成列表只返回当前匿名会话自己的项目", async () => {
  const { project, asset } = seedAsset()

  const own = await getGenerations(new Request(
    `http://localhost/api/generations?projectId=${project.id}&targetType=shot&targetId=shot-1`,
    { headers: headers(OWNER_A) },
  ))
  assert.equal(own.status, 200)
  const ownBody = await own.json()
  assert.deepEqual(ownBody.data.assets.map((item: { id: string }) => item.id), [asset.id])

  const foreign = await getGenerations(new Request(
    `http://localhost/api/generations?projectId=${project.id}`,
    { headers: headers(OWNER_B) },
  ))
  assert.equal(foreign.status, 403)
})

test("G3.2 PATCH 只允许在所属项目内回选已有资产", async () => {
  const { db, project, asset } = seedAsset()
  const res = await patchGenerations(new Request("http://localhost/api/generations", {
    method: "PATCH",
    headers: headers(OWNER_A, true),
    body: JSON.stringify({ projectId: project.id, assetId: asset.id }),
  }))
  const payload = await res.json()

  assert.equal(res.status, 200)
  assert.equal(payload.data.asset.id, asset.id)
  assert.ok(payload.data.asset.selectedAt)
  assert.ok(selectGeneratedAsset(db, project.id, asset.id).selectedAt)
})

test("G3.3 生成结果读取必须校验项目归属并返回真实图片字节", async () => {
  const { asset } = seedAsset()
  const own = await getGeneratedAsset(
    new Request(`http://localhost/api/generated-assets/${asset.id}`, { headers: headers(OWNER_A) }),
    { params: { id: asset.id } },
  )
  assert.equal(own.status, 200)
  assert.equal(own.headers.get("content-type"), "image/png")
  assert.deepEqual(new Uint8Array(await own.arrayBuffer()), PNG)

  const foreign = await getGeneratedAsset(
    new Request(`http://localhost/api/generated-assets/${asset.id}`, { headers: headers(OWNER_B) }),
    { params: { id: asset.id } },
  )
  assert.equal(foreign.status, 403)
})

test("G2.1-G2.2 POST 完整走通 queued→running→succeeded，并且只发送文本提示词", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "完整生成", OWNER_A)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{ id: "shot-row-1", entityId: "shot-entity-api", prompt: "first frame" }],
  })

  const originalFetch = globalThis.fetch
  let providerBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const url = String(_input)
    if (url.endsWith("/image-synthesis")) {
      providerBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      return Response.json({ output: { task_id: "task-api", task_status: "PENDING" } })
    }
    if (url.endsWith("/api/v1/tasks/task-api")) {
      return Response.json({
        output: {
          task_status: "SUCCEEDED",
          results: [{ url: "https://cdn.example.com/result.png" }],
        },
      })
    }
    return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } })
  }) as typeof fetch
  process.env.ALIYUN_DASHSCOPE_API_KEY = "server-test-key"
  process.env.ALIYUN_IMAGE_MODEL = "wanx2.1-t2i-turbo"

  try {
    const res = await postGenerations(new Request("http://localhost/api/generations", {
      method: "POST",
      headers: headers(OWNER_A, true),
      body: JSON.stringify({
        projectId: project.id,
        targetType: "shot",
        targetId: "shot-entity-api",
        prompt: "first frame",
        aspect: "vertical",
        look: {
          palette: "冷蓝、低饱和",
          light: "顶光",
          lens: "长焦",
          banned: "霓虹",
        },
      }),
    }))
    const payload = await res.json()

    assert.equal(res.status, 200)
    assert.equal(payload.data.task.status, "succeeded")
    assert.equal(payload.data.asset.selectedAt !== null, true)
    assert.ok(providerBody)
    const sent = providerBody as Record<string, unknown>
    const input = sent.input as Record<string, unknown>
    assert.match(String(input.prompt), /first frame/)
    assert.match(String(input.prompt), /冷蓝、低饱和/)
    assert.equal(typeof (sent.parameters as Record<string, unknown>).seed, "number")
    assert.equal("apiKey" in sent, false)
    assert.equal("referenceImages" in sent, false)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ALIYUN_DASHSCOPE_API_KEY
    delete process.env.ALIYUN_IMAGE_MODEL
  }
})

test("P2c 删除项目同时清理关键帧文件，不留下孤儿像素", async () => {
  const { project, asset } = seedAsset()
  const file = resolveGeneratedStoragePath(asset.storageKey)
  assert.equal(fs.existsSync(file), true)

  const res = await deleteProjectRoute(new Request(
    `http://localhost/api/projects?id=${project.id}`,
    { method: "DELETE", headers: headers(OWNER_A) },
  ))
  assert.equal(res.status, 200)
  assert.equal(fs.existsSync(file), false)
})
