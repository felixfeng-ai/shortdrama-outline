import { test } from "node:test"
import assert from "node:assert/strict"

import { GET as getTimeline, POST as initializeTimeline } from "../app/api/timelines/[episode]/route.ts"
import { PUT as putTimelineDraft } from "../app/api/timelines/[episode]/draft/route.ts"
import { POST as postTimelineVersion } from "../app/api/timelines/[episode]/versions/route.ts"
import { createSnapshot, createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const OWNER = `anon_${"t".repeat(48)}`

function headers(json = false): Headers {
  const result = new Headers({ cookie: `chengju_sid=${OWNER}` })
  if (json) result.set("content-type", "application/json")
  return result
}

function context(episode = "1") {
  return { params: Promise.resolve({ episode }) }
}

function setup() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "时间线接口", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [
      {
        id: "row-1",
        entityId: "shot-1",
        episode: 1,
        shot: 1,
        scene: "雨夜",
        params: { duration: 5 },
      },
      {
        id: "row-2",
        entityId: "shot-2",
        episode: 1,
        shot: 2,
        scene: "走廊",
        params: { duration: 5 },
      },
    ],
  })
  return { db, project }
}

test("P1-V5 时间线接口完成初始化、读取、编辑和固化版本", async () => {
  const { project } = setup()
  const initialized = await initializeTimeline(new Request(
    "http://localhost/api/timelines/1",
    {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ projectId: project.id }),
    },
  ), context())
  const initializedBody = await initialized.json()
  assert.equal(initialized.status, 200)
  assert.equal(initializedBody.data.created, true)
  assert.equal(initializedBody.data.draft.revision, 1)
  assert.equal(initializedBody.data.draft.payload.blockedCount, 2)

  const read = await getTimeline(new Request(
    `http://localhost/api/timelines/1?projectId=${project.id}`,
    { headers: headers() },
  ), context())
  const readBody = await read.json()
  assert.equal(read.status, 200)
  assert.equal(readBody.data.draft.id, initializedBody.data.draft.id)
  assert.deepEqual(readBody.data.versions, [])

  const reversed = {
    ...initializedBody.data.draft.payload,
    clips: [...initializedBody.data.draft.payload.clips].reverse(),
  }
  const saved = await putTimelineDraft(new Request(
    "http://localhost/api/timelines/1/draft",
    {
      method: "PUT",
      headers: headers(true),
      body: JSON.stringify({
        projectId: project.id,
        expectedRevision: 1,
        payload: reversed,
      }),
    },
  ), context())
  const savedBody = await saved.json()
  assert.equal(saved.status, 200)
  assert.equal(savedBody.data.draft.revision, 2)

  const frozen = await postTimelineVersion(new Request(
    "http://localhost/api/timelines/1/versions",
    {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ projectId: project.id, expectedRevision: 2 }),
    },
  ), context())
  const frozenBody = await frozen.json()
  assert.equal(frozen.status, 200)
  assert.equal(frozenBody.data.version.revision, 2)
  assert.deepEqual(
    frozenBody.data.version.payload.clips.map((clip: { shotId: string }) => clip.shotId),
    ["shot-2", "shot-1"],
  )

  const stale = await postTimelineVersion(new Request(
    "http://localhost/api/timelines/1/versions",
    {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ projectId: project.id, expectedRevision: 1 }),
    },
  ), context())
  assert.equal(stale.status, 409)
})

test("P1-V5 初始化没有分镜的集返回明确 400", async () => {
  const { project } = setup()
  const response = await initializeTimeline(new Request(
    "http://localhost/api/timelines/9",
    {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ projectId: project.id }),
    },
  ), context("9"))
  const payload = await response.json()
  assert.equal(response.status, 400)
  assert.match(payload.error, /第 9 集还没有分镜/)
})

test("P1-V5 时间线按项目 owner 隔离", async () => {
  const { project } = setup()
  const response = await getTimeline(new Request(
    `http://localhost/api/timelines/1?projectId=${project.id}`,
    {
      headers: new Headers({
        cookie: `chengju_sid=anon_${"x".repeat(48)}`,
      }),
    },
  ), context())
  assert.equal(response.status, 403)
})
