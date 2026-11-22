import assert from "node:assert/strict"
import test from "node:test"

import { POST as postSample } from "../app/api/sample/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { readGeneratedAsset } from "../lib/generation/files.ts"
import { listVideoRenders } from "../lib/video/render-repo.ts"

function request() {
  return new Request("http://localhost/api/sample", {
    method: "POST",
    headers: { cookie: "chengju_sid=anon_local_development_session_0000000000000000" },
  })
}

test("SAMPLE-PRODUCTION 示例项目包含真实可播放成片且重复载入幂等", async () => {
  __resetDbForTests(":memory:")
  const firstResponse = await postSample(request())
  assert.equal(firstResponse.status, 200)
  const first = await firstResponse.json()
  assert.equal(first.success, true)
  assert.equal(first.data.reused, false)
  assert.equal(first.data.sampleProduction.created, true)

  const projectId = first.data.project.id as string
  const renders = listVideoRenders(getDbForRequest(), projectId)
  assert.equal(renders.length, 1)
  assert.equal(renders[0]?.status, "succeeded")
  assert.equal(renders[0]?.qualityProfile, "delivery")
  assert.equal(renders[0]?.durationMs, 6_000)
  assert.ok(renders[0]?.videoStorageKey)
  assert.ok(renders[0]?.srtStorageKey)
  assert.ok(renders[0]?.manifestStorageKey)
  assert.ok(readGeneratedAsset(renders[0]!.videoStorageKey!).byteLength > 100_000)
  assert.match(
    new TextDecoder().decode(readGeneratedAsset(renders[0]!.srtStorageKey!)),
    /暴雨夜/,
  )

  const secondResponse = await postSample(request())
  const second = await secondResponse.json()
  assert.equal(second.data.reused, true)
  assert.equal(second.data.sampleProduction.created, false)
  assert.equal(listVideoRenders(getDbForRequest(), projectId).length, 1)
})
