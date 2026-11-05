import assert from "node:assert/strict"
import test from "node:test"

import {
  GET as getGeneratedAsset,
  HEAD as headGeneratedAsset,
} from "../app/api/generated-assets/[id]/route.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { writeGeneratedVideo } from "../lib/generation/files.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  saveGeneratedAsset,
} from "../lib/generation/repo.ts"

const OWNER = `anon_${"r".repeat(48)}`
const VIDEO = Uint8Array.from({ length: 64 }, (_, index) => index)

function seedVideoAsset() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "视频 Range 测试", OWNER)
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "video",
    mediaKind: "video",
  })
  const file = writeGeneratedVideo(project.id, "range-video", VIDEO, "video/mp4")
  const asset = saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    storageKey: file.storageKey,
    mime: "video/mp4",
    bytes: file.bytes,
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "video",
    mediaKind: "video",
    durationMs: 5_000,
  })
  completeGenerationTask(db, task.id, asset.id)
  return asset
}

function request(assetId: string, range?: string): Request {
  const headers = new Headers({ cookie: `chengju_sid=${OWNER}` })
  if (range) headers.set("range", range)
  return new Request(`http://localhost/api/generated-assets/${assetId}`, { headers })
}

test("视频资产支持 HEAD 元数据而不返回正文", async () => {
  const asset = seedVideoAsset()
  const response = await headGeneratedAsset(request(asset.id), {
    params: { id: asset.id },
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-type"), "video/mp4")
  assert.equal(response.headers.get("content-length"), String(VIDEO.length))
  assert.equal(response.headers.get("accept-ranges"), "bytes")
  assert.match(response.headers.get("content-disposition") ?? "", /\.mp4/)
  assert.equal((await response.arrayBuffer()).byteLength, 0)
})

test("视频资产完整 GET 返回 200 和可下载 MP4", async () => {
  const asset = seedVideoAsset()
  const response = await getGeneratedAsset(request(asset.id), {
    params: { id: asset.id },
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("accept-ranges"), "bytes")
  assert.match(response.headers.get("content-disposition") ?? "", /\.mp4/)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), VIDEO)
})

test("视频资产 Range 返回 206 和精确切片", async () => {
  const asset = seedVideoAsset()
  const response = await getGeneratedAsset(request(asset.id, "bytes=10-19"), {
    params: { id: asset.id },
  })

  assert.equal(response.status, 206)
  assert.equal(response.headers.get("accept-ranges"), "bytes")
  assert.equal(response.headers.get("content-range"), `bytes 10-19/${VIDEO.length}`)
  assert.equal(response.headers.get("content-length"), "10")
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), VIDEO.slice(10, 20))
})

test("越界 Range 返回 416 和完整长度", async () => {
  const asset = seedVideoAsset()
  const response = await getGeneratedAsset(request(asset.id, "bytes=999-1000"), {
    params: { id: asset.id },
  })

  assert.equal(response.status, 416)
  assert.equal(response.headers.get("content-range"), `bytes */${VIDEO.length}`)
})
