import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  listGeneratedAssets,
  listGenerationTasks,
} from "../lib/generation/repo.ts"
import { readGeneratedAsset } from "../lib/generation/files.ts"
import { SAMPLE_SHOTS } from "../lib/sample.ts"

const routePath = "app/api/projects/[id]/shot-video-import/route.ts"

function importRequest(projectId: string, shotId: string, bytes?: Uint8Array) {
  const source = bytes ?? new Uint8Array(fs.readFileSync("public/sample/sample-production.mp4"))
  const fileBytes = new Uint8Array(source.byteLength)
  fileBytes.set(source)
  const form = new FormData()
  form.set("shotId", shotId)
  form.set("file", new File(
    [fileBytes.buffer],
    "external-shot.mp4",
    { type: "video/mp4" },
  ))
  return new Request(`http://localhost/api/projects/${projectId}/shot-video-import`, {
    method: "POST",
    body: form,
  })
}

test("P3-A 外部 MP4 导入为已采用镜头视频且不扣额度", async () => {
  assert.equal(fs.existsSync(routePath), true, "缺少外部视频导入接口")
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "外部视频回传", "local")
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: SAMPLE_SHOTS,
  })
  const shot = SAMPLE_SHOTS[0]
  const { POST } = await import("../app/api/projects/[id]/shot-video-import/route.ts")
  const response = await POST(importRequest(project.id, shot.entityId), {
    params: Promise.resolve({ id: project.id }),
  })
  const payload = await response.json()

  assert.equal(response.status, 200, payload.error ?? "")
  const assets = listGeneratedAssets(db, project.id, "shot", shot.entityId, "video")
  assert.equal(assets.length, 1)
  assert.equal(assets[0]?.selectedAt !== null, true)
  assert.equal(assets[0]?.providerId, "external-upload")
  assert.equal(assets[0]?.model, "external-video")
  assert.ok((assets[0]?.durationMs ?? 0) >= 5_900)
  assert.ok((assets[0]?.width ?? 0) > 0)
  assert.ok((assets[0]?.height ?? 0) > 0)
  assert.ok(readGeneratedAsset(assets[0]!.storageKey).byteLength > 100_000)
  const tasks = listGenerationTasks(db, project.id)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0]?.status, "succeeded")
  assert.equal(tasks[0]?.quotaUnits, 0)
})

test("P3-B 导入接口拒绝伪装 MP4 与不存在的镜头", async () => {
  assert.equal(fs.existsSync(routePath), true, "缺少外部视频导入接口")
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "外部视频校验", "local")
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: SAMPLE_SHOTS,
  })
  const { POST } = await import("../app/api/projects/[id]/shot-video-import/route.ts")
  const fake = new TextEncoder().encode("not an mp4")
  const badFile = await POST(importRequest(
    project.id,
    SAMPLE_SHOTS[0].entityId,
    fake,
  ), { params: Promise.resolve({ id: project.id }) })
  const badShot = await POST(importRequest(
    project.id,
    "missing-shot",
    fs.readFileSync("public/sample/sample-production.mp4"),
  ), { params: Promise.resolve({ id: project.id }) })

  assert.equal(badFile.status, 400)
  assert.equal(badShot.status, 400)
  assert.equal(listGeneratedAssets(db, project.id).length, 0)
})

test("P3-C 镜头视频工作区接入外部导入，E2E 验证下游动态分镜", () => {
  const client = fs.readFileSync("lib/video/client.ts", "utf8")
  const panel = fs.readFileSync("components/BatchVideoPanel.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")
  const nginx = fs.readFileSync("deploy/nginx-veyatv.com.conf", "utf8")
  const script = fs.readFileSync("scripts/verify-core-production.mjs", "utf8")

  assert.match(client, /importShotVideo/)
  assert.match(client, /shot-video-import/)
  assert.match(panel, /导入外部视频/)
  assert.match(panel, /外部导入/)
  assert.match(panel, /batch-generation-import/)
  assert.match(css, /\.batch-generation-import/)
  assert.match(nginx, /shot-video-import/)
  assert.match(nginx, /client_max_body_size\s+100m/)
  assert.match(script, /导入外部视频/)
  assert.match(script, /外部导入/)
  assert.match(script, /shot-video-import-ready-desktop\.png/)
  assert.match(script, /shot-video-import-mobile\.png/)
})
