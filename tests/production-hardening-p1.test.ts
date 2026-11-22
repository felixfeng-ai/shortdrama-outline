import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { POST as postSample } from "../app/api/sample/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { listGeneratedAssets, listGenerationTasks } from "../lib/generation/repo.ts"
import { SAMPLE_SHOTS } from "../lib/sample.ts"
import { buildStoryboardPreviewPlan } from "../lib/production/storyboard-preview.ts"

function sampleRequest() {
  return new Request("http://localhost/api/sample", {
    method: "POST",
    headers: { cookie: "chengju_sid=anon_local_development_session_0000000000000000" },
  })
}

test("P1-A 示例项目自带 5 张真实已采用首帧并形成 30 秒动态分镜", async () => {
  __resetDbForTests(":memory:")
  const response = await postSample(sampleRequest())
  assert.equal(response.status, 200)
  const payload = await response.json()
  const projectId = payload.data.project.id as string
  const db = getDbForRequest()
  const assets = listGeneratedAssets(db, projectId, "shot")
  const selectedImages = assets.filter((asset) => (
    asset.mediaKind === "image" && asset.selectedAt !== null
  ))
  const preview = buildStoryboardPreviewPlan({
    projectId,
    shots: SAMPLE_SHOTS,
    assets,
  })

  assert.ok(SAMPLE_SHOTS.length >= 5)
  assert.equal(selectedImages.length, 5)
  assert.equal(preview.status, "ready")
  assert.equal(preview.segmentCount, 5)
  assert.equal(preview.totalDurationSeconds, 30)
  assert.ok(listGenerationTasks(db, projectId).every((task) => task.status === "succeeded"))
  assert.ok(listGenerationTasks(db, projectId).every((task) => (task.quotaUnits ?? 0) === 0))

  const secondResponse = await postSample(sampleRequest())
  assert.equal(secondResponse.status, 200)
  assert.equal(listGeneratedAssets(db, projectId, "shot").length, 5)
  assert.equal(listGenerationTasks(db, projectId).length, 5)
})

test("P1-B 工作台只在 ready 时展示真实动态分镜入口", () => {
  const home = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")
  const css = fs.readFileSync("app/workspace-shell.css", "utf8")

  assert.match(home, /buildStoryboardPreviewPlan/)
  assert.match(home, /storyboardPreview\.status === ['"]ready['"]/)
  assert.match(home, /播放动态分镜/)
  assert.match(home, /storyboard\/\$\{projectId\}/)
  assert.match(home, /storyboardPreview\.totalDurationSeconds/)
  assert.match(home, /storyboardPreview\.segmentCount/)
  assert.match(css, /\.wfx-dossier-secondary-actions a/)
})

test("P1-C 核心 E2E 覆盖动态分镜 ready、播放与 insufficient", () => {
  const script = fs.readFileSync("scripts/verify-core-production.mjs", "utf8")

  assert.match(script, /播放动态分镜/)
  assert.match(script, /storyboard-progress/)
  assert.match(script, /真实素材不足/)
  assert.match(script, /storyboard-ready-desktop\.png/)
  assert.match(script, /storyboard-ready-mobile\.png/)
  assert.match(script, /storyboard-insufficient\.png/)
})
