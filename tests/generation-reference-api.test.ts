import { test } from "node:test"
import assert from "node:assert/strict"

import { POST as postGenerations } from "../app/api/generations/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  createGenerationTask,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"
import { writeGeneratedImage } from "../lib/generation/files.ts"

const OWNER = `anon_${"r".repeat(48)}`
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x03])

test("生成接口自动带入当前项目已采用的角色图，并返回实际参考数量", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "reference api", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualCharacters",
    payload: [{ name: "林远", entityId: "char-lin" }],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{ id: "shot-1", entityId: "shot-e-1", characters: ["林远"] }],
  })
  const referenceTask = createGenerationTask(db, {
    projectId: project.id,
    targetType: "character",
    targetId: "char-lin",
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "portrait",
  })
  const file = writeGeneratedImage(project.id, referenceTask.id, PNG, "image/png")
  const reference = saveGeneratedAsset(db, {
    taskId: referenceTask.id,
    projectId: project.id,
    targetType: "character",
    targetId: "char-lin",
    storageKey: file.storageKey,
    mime: "image/png",
    bytes: file.bytes,
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "portrait",
  })
  selectGeneratedAsset(db, project.id, reference.id)

  const originalFetch = globalThis.fetch
  let submitted: Record<string, unknown> | null = null
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/multimodal-generation/generation")) {
      submitted = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      return Response.json({
        output: {
          choices: [{
            message: { content: [{ image: "https://cdn.example.com/shot.png" }] },
          }],
        },
      })
    }
    return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } })
  }) as typeof fetch
  process.env.ALIYUN_DASHSCOPE_API_KEY = "server-test-key"
  process.env.ALIYUN_IMAGE_MODEL = "wanx2.1-t2i-turbo"
  process.env.ALIYUN_IMAGE_EDIT_MODEL = "qwen-image-2.0-pro"

  try {
    const response = await postGenerations(new Request("http://localhost/api/generations", {
      method: "POST",
      headers: {
        cookie: `chengju_sid=${OWNER}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: project.id,
        targetType: "shot",
        targetId: "shot-e-1",
        prompt: "first frame",
        aspect: "portrait",
      }),
    }))
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.data.referenceCount, 1)
    assert.equal(payload.data.asset.model, "qwen-image-2.0-pro")
    assert.ok(submitted)
    const body = submitted as Record<string, unknown>
    const input = body.input as { messages: Array<{ content: Array<Record<string, string>> }> }
    const content = input.messages[0].content
    assert.equal(content.length, 2)
    assert.match(content[0].image, /^data:image\/png;base64,/)
    assert.match(content[1].text, /林远/)
    assert.match(content[1].text, /身份参考/)
    assert.equal(body.model, "qwen-image-2.0-pro")
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ALIYUN_DASHSCOPE_API_KEY
    delete process.env.ALIYUN_IMAGE_MODEL
    delete process.env.ALIYUN_IMAGE_EDIT_MODEL
  }
})
