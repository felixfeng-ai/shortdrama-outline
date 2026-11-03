import { test } from "node:test"
import assert from "node:assert/strict"

import { POST as runContinuity } from "../app/api/skills/continuity/run/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  SAMPLE_PLACES,
  SAMPLE_SHOTS,
  SAMPLE_VISUALS,
} from "../lib/sample.ts"

const OWNER_A = `anon_${"c".repeat(48)}`
const OWNER_B = `anon_${"d".repeat(48)}`

function request(projectId: string, owner = OWNER_A): Request {
  return new Request("http://localhost/api/skills/continuity/run", {
    method: "POST",
    headers: new Headers({
      cookie: `chengju_sid=${owner}`,
      "content-type": "application/json",
    }),
    body: JSON.stringify({ projectId }),
  })
}

function state(db: ReturnType<typeof getDbForRequest>, projectId: string) {
  return {
    snapshots: Number((db.prepare(
      "SELECT COUNT(*) AS n FROM snapshots WHERE project_id = ?",
    ).get(projectId) as { n: number }).n),
    tasks: Number((db.prepare(
      "SELECT COUNT(*) AS n FROM generation_tasks WHERE project_id = ?",
    ).get(projectId) as { n: number }).n),
    assets: Number((db.prepare(
      "SELECT COUNT(*) AS n FROM generated_assets WHERE project_id = ?",
    ).get(projectId) as { n: number }).n),
    updatedAt: Number((db.prepare(
      "SELECT updated_at FROM projects WHERE id = ?",
    ).get(projectId) as { updated_at: number }).updated_at),
  }
}

test("CTA1 服务端读取最新项目快照并返回可定位的连续性报告", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "连续性接口项目", OWNER_A)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [SAMPLE_SHOTS[0]],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: SAMPLE_SHOTS,
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualCharacters",
    payload: SAMPLE_VISUALS,
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualPlaces",
    payload: SAMPLE_PLACES,
  })

  const response = await runContinuity(request(project.id))
  const payload = await response.json()

  assert.equal(response.status, 200, payload?.error ?? "")
  const report = payload.data.report
  assert.equal(report.readOnly, true)
  assert.equal(report.writes, false)
  assert.equal(report.modelCalls, 0)
  assert.equal(report.quotaCharged, 0)
  assert.equal(report.summary.totalShots, SAMPLE_SHOTS.length)
  assert.ok(report.summary.issueShots > 0)
  assert.ok(report.repairQueue.some((item: { episode: number; shot: number }) => item.episode === 3 && item.shot === 3))
  assert.match(
    JSON.stringify(report.repairQueue),
    /苏婉|参考图/,
  )
})

test("CTA2 检查前后快照、任务、生成图和项目更新时间完全不变", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "只读检查", OWNER_A)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: SAMPLE_SHOTS,
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualCharacters",
    payload: SAMPLE_VISUALS,
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualPlaces",
    payload: SAMPLE_PLACES,
  })
  const before = state(db, project.id)

  const response = await runContinuity(request(project.id))
  assert.equal(response.status, 200)
  await response.json()

  assert.deepEqual(state(db, project.id), before)
})

test("CTA3 项目归属隔离且不泄露报告内容", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "私有连续性项目", OWNER_A)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: SAMPLE_SHOTS,
  })

  const response = await runContinuity(request(project.id, OWNER_B))
  const payload = await response.json()

  assert.equal(response.status, 403)
  assert.equal(payload.success, false)
  assert.match(payload.error, /不存在|无权/)
})

test("CTA4 缺少 projectId 时返回 400", async () => {
  __resetDbForTests(":memory:")
  const response = await runContinuity(new Request(
    "http://localhost/api/skills/continuity/run",
    {
      method: "POST",
      headers: new Headers({
        cookie: `chengju_sid=${OWNER_A}`,
        "content-type": "application/json",
      }),
      body: JSON.stringify({}),
    },
  ))
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.match(payload.error, /projectId/)
})
