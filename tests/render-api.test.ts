import { test } from "node:test"
import assert from "node:assert/strict"

import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { writeGeneratedArtifact } from "../lib/generation/files.ts"
import {
  completeVideoRender,
  createVideoRender,
} from "../lib/video/render-repo.ts"
import { renderArtifactResponse } from "../lib/video/render-http.ts"

const OWNER = `anon_${"a".repeat(48)}`
const OTHER = `anon_${"b".repeat(48)}`

function cookie(owner: string): Headers {
  return new Headers({ cookie: `chengju_sid=${owner}` })
}

test("P1-V5.16 成片产物只允许当前项目 owner 下载", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "成片权限", OWNER)
  const render = createVideoRender(db, {
    projectId: project.id,
    episode: 1,
    timelineVersionId: "version-api-1",
    timelineRevision: 1,
  })
  const video = writeGeneratedArtifact(
    project.id,
    `renders/${render.id}/output.mp4`,
    new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
  )
  const srt = writeGeneratedArtifact(
    project.id,
    `renders/${render.id}/output.srt`,
    new TextEncoder().encode("1\n00:00:00,000 --> 00:00:01,000\n测试\n\n"),
  )
  const manifest = writeGeneratedArtifact(
    project.id,
    `renders/${render.id}/manifest.json`,
    new TextEncoder().encode('{"schemaVersion":1}\n'),
  )
  completeVideoRender(db, render.id, {
    durationMs: 1_000,
    videoStorageKey: video.storageKey,
    srtStorageKey: srt.storageKey,
    manifestStorageKey: manifest.storageKey,
  })

  const response = await renderArtifactResponse(
    new Request(
      `http://localhost/api/video/renders/${render.id}/file?projectId=${project.id}`,
      { headers: cookie(OWNER) },
    ),
    render.id,
    "video",
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-type"), "video/mp4")
  assert.match(response.headers.get("content-disposition") ?? "", /episode-1\.mp4/)

  const denied = await renderArtifactResponse(
    new Request(
      `http://localhost/api/video/renders/${render.id}/file?projectId=${project.id}`,
      { headers: cookie(OTHER) },
    ),
    render.id,
    "video",
  )
  assert.notEqual(denied.status, 200)
})
