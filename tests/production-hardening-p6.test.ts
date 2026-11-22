import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { SAMPLE_SHOTS } from "../lib/sample.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { listGeneratedAssets } from "../lib/generation/repo.ts"

test("P6-A 批量外部视频文件名可按集号镜号映射", async () => {
  const path = "lib/video/external-import.ts"
  assert.equal(fs.existsSync(path), true, "缺少外部视频批量映射器")
  const module = await import("../lib/video/external-import.ts")
  const samples = [
    ["E01-S02.mp4", 1, 2],
    ["EP03_SHOT01.mp4", 3, 1],
    ["1-3.mp4", 1, 3],
    ["第3集第2镜.mp4", 3, 2],
  ] as const

  for (const [name, episode, shot] of samples) {
    assert.deepEqual(module.parseExternalVideoFilename(name), { episode, shot })
  }
  assert.equal(module.parseExternalVideoFilename("random-video.mp4"), null)
  assert.equal(module.parseExternalVideoFilename("E00-S01.mp4"), null)
})

test("P6-B 批量计划只提交唯一可匹配文件，冲突和无效项留在预览", async () => {
  const path = "lib/video/external-import.ts"
  assert.equal(fs.existsSync(path), true, "缺少外部视频批量映射器")
  const module = await import("../lib/video/external-import.ts")
  const plan = module.planExternalVideoImport({
    shots: SAMPLE_SHOTS,
    files: [
      { index: 0, name: "E01-S02.mp4", size: 1000, type: "video/mp4" },
      { index: 1, name: "E01-S03.mp4", size: 1000, type: "video/mp4" },
      { index: 2, name: "E01-S02.mp4", size: 1000, type: "video/mp4" },
      { index: 3, name: "unknown.mp4", size: 1000, type: "video/mp4" },
      { index: 4, name: "E03-S01.mp4", size: 1000, type: "text/plain" },
    ],
  })

  assert.deepEqual(plan.mapped.map((item: { fileIndex: number }) => item.fileIndex), [1])
  assert.equal(plan.issues.length, 4)
  assert.match(JSON.stringify(plan.issues), /重复|冲突/)
  assert.match(JSON.stringify(plan.issues), /无法识别/)
  assert.match(JSON.stringify(plan.issues), /MP4/)
})

test("P6-B2 一次请求可把多个外部视频分别采用到对应镜头", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "批量外部视频回传", "local")
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: SAMPLE_SHOTS,
  })
  const bytes = fs.readFileSync("public/sample/sample-production.mp4")
  const form = new FormData()
  form.append("files", new File([bytes], "E01-S03.mp4", { type: "video/mp4" }))
  form.append("files", new File([bytes], "E03-S02.mp4", { type: "video/mp4" }))
  form.set("mapping", JSON.stringify([
    { fileIndex: 0, shotId: SAMPLE_SHOTS[3].entityId },
    { fileIndex: 1, shotId: SAMPLE_SHOTS[4].entityId },
  ]))
  const { POST } = await import("../app/api/projects/[id]/shot-video-import/route.ts")
  const response = await POST(
    new Request(`http://localhost/api/projects/${project.id}/shot-video-import`, {
      method: "POST",
      body: form,
    }),
    { params: Promise.resolve({ id: project.id }) },
  )
  const payload = await response.json()

  assert.equal(response.status, 200, payload.error ?? "")
  assert.equal(payload.data.importedCount, 2)
  assert.equal(payload.data.failures.length, 0)
  for (const shot of [SAMPLE_SHOTS[3], SAMPLE_SHOTS[4]]) {
    const assets = listGeneratedAssets(db, project.id, "shot", shot.entityId, "video")
    assert.equal(assets.length, 1)
    assert.equal(assets[0]?.selectedAt !== null, true)
  }
})

test("P6-C UI、客户端和单次批量接口已接线", () => {
  const panel = fs.readFileSync("components/BatchVideoPanel.tsx", "utf8")
  const client = fs.readFileSync("lib/video/client.ts", "utf8")
  const route = fs.readFileSync(
    "app/api/projects/[id]/shot-video-import/route.ts",
    "utf8",
  )
  const script = fs.readFileSync("scripts/verify-core-production.mjs", "utf8")

  assert.match(panel, /批量导入外部视频/)
  assert.match(panel, /导入预览/)
  assert.match(panel, /external-video-batch-dialog/)
  assert.match(client, /batchImportShotVideos/)
  assert.match(client, /mapping/)
  assert.match(route, /form\.getAll\("files"\)/)
  assert.match(route, /form\.get\("mapping"\)/)
  assert.match(script, /E01-S03\.mp4/)
  assert.match(script, /external-video-batch-desktop\.png/)
  assert.match(script, /external-video-batch-mobile\.png/)
})
