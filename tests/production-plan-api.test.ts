import { test } from "node:test"
import assert from "node:assert/strict"

import {
  createProductionPlan,
  extendProductionPlan,
  getProductionPlan,
} from "../lib/production/repo.ts"
import { openDb, getDataDir } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { POST as postProject } from "../app/api/projects/route.ts"
import {
  GET as getProduction,
  PATCH as patchProduction,
  POST as postProduction,
} from "../app/api/projects/[id]/production/route.ts"
import { POST as extendProduction } from "../app/api/projects/[id]/production/extend/route.ts"

function tmpDbPath(tag: string): string {
  return `${getDataDir()}/tmp/test-${tag}-${process.pid}-${Date.now()}.db`
}

function json(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

test("PROD7 生产计划按项目唯一，并持久化阶段与集数目标", () => {
  const db = openDb(tmpDbPath("production-plan"))
  const project = createProject(db, "样片项目")

  const plan = createProductionPlan(db, {
    projectId: project.id,
    projectType: "drama",
    mode: "sample",
    targetEpisodes: 3,
  })

  assert.equal(plan.projectId, project.id)
  assert.equal(plan.mode, "sample")
  assert.equal(plan.targetEpisodes, 3)
  assert.equal(plan.stages.length, 8)
  assert.equal(getProductionPlan(db, project.id)?.id, plan.id)
  assert.throws(() => createProductionPlan(db, {
    projectId: project.id,
    projectType: "drama",
    mode: "batch",
  }), /已经存在/)
})

test("PROD8 非破坏扩展记录来源与目标，已有集保持不变", () => {
  const db = openDb(tmpDbPath("production-extension"))
  const project = createProject(db, "扩容项目")
  createProductionPlan(db, {
    projectId: project.id,
    projectType: "drama",
    mode: "sample",
    targetEpisodes: 3,
  })

  const result = extendProductionPlan(db, project.id, {
    mode: "batch",
    targetEpisodes: 10,
    existingEpisodeNumbers: [1, 2, 3],
  })

  assert.equal(result.plan.mode, "batch")
  assert.equal(result.plan.targetEpisodes, 10)
  assert.deepEqual(result.extension.existingEpisodeNumbers, [1, 2, 3])
  assert.deepEqual(result.extension.newEpisodeNumbers, [4, 5, 6, 7, 8, 9, 10])
  assert.equal(result.extension.fromTargetEpisodes, 3)
  assert.equal(result.extension.toTargetEpisodes, 10)
})

test("PROD9 生产计划 API 创建、读取并更新档位", async () => {
  __resetDbForTests(":memory:")
  const created = await (await postProject(json({ title: "API 样片" }))).json()
  const projectId = created.data.project.id as string

  const createdPlan = await postProduction(json({
    projectType: "drama",
    mode: "sample",
    targetEpisodes: 8,
  }), routeContext(projectId))
  const createdPayload = await createdPlan.json()

  assert.equal(createdPlan.status, 200)
  assert.equal(createdPayload.data.plan.mode, "sample")
  assert.equal(createdPayload.data.plan.targetEpisodes, 3)
  assert.equal(createdPayload.data.plan.currentStage, "source")

  const read = await getProduction(
    new Request(`http://localhost/api/projects/${projectId}/production`),
    routeContext(projectId),
  )
  const readPayload = await read.json()
  assert.equal(readPayload.data.plan.id, createdPayload.data.plan.id)
  assert.equal(readPayload.data.plan.stages.length, 8)

  const patched = await patchProduction(json({
    mode: "batch",
    targetEpisodes: 10,
    currentStage: "characters",
  }, "PATCH"), routeContext(projectId))
  const patchedPayload = await patched.json()
  assert.equal(patchedPayload.data.plan.mode, "batch")
  assert.equal(patchedPayload.data.plan.targetEpisodes, 10)
  assert.equal(patchedPayload.data.plan.currentStage, "characters")
})

test("PROD10 生产计划 API 拒绝非法档位与越权项目", async () => {
  __resetDbForTests(":memory:")
  const created = await (await postProject(json({ title: "校验项目" }))).json()
  const projectId = created.data.project.id as string

  const invalid = await postProduction(json({
    projectType: "drama",
    mode: "unknown",
    targetEpisodes: 3,
  }), routeContext(projectId))
  assert.equal(invalid.status, 400)

  const missing = await postProduction(json({
    projectType: "drama",
    mode: "sample",
    targetEpisodes: 3,
  }), routeContext("00000000-0000-4000-8000-000000000000"))
  assert.ok([400, 403].includes(missing.status))
})

test("PROD11 数据库迁移 25 具备生产计划、阶段和扩展表", () => {
  const db = getDbForRequest()
  const tables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'production_%' OR name = 'project_production_plans' ORDER BY name",
  ).all() as { name: string }[]).map((row) => row.name)

  for (const table of [
    "project_production_plans",
    "production_stages",
    "production_gate_results",
    "production_asset_locks",
    "production_extensions",
  ]) {
    assert.ok(tables.includes(table), `缺少 ${table}`)
  }
})

test("PROD12 扩容 API 只返回缺失集并记录来源目标", async () => {
  __resetDbForTests(":memory:")
  const created = await (await postProject(json({ title: "扩容 API" }))).json()
  const projectId = created.data.project.id as string
  await postProduction(json({
    projectType: "drama",
    mode: "sample",
    targetEpisodes: 3,
  }), routeContext(projectId))

  const response = await extendProduction(json({
    mode: "batch",
    targetEpisodes: 10,
    existingEpisodeNumbers: [1, 2, 3],
    estimatedUnits: 6,
  }), routeContext(projectId))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.plan.mode, "batch")
  assert.equal(payload.data.plan.targetEpisodes, 10)
  assert.deepEqual(payload.data.extension.newEpisodeNumbers, [4, 5, 6, 7, 8, 9, 10])
  assert.equal(payload.data.extension.estimatedUnits, 6)
})

test("PROD13 扩容不能把目标改成不大于当前值", async () => {
  const db = openDb(tmpDbPath("production-extension-invalid"))
  const project = createProject(db, "非法扩容项目")
  createProductionPlan(db, {
    projectId: project.id,
    projectType: "drama",
    mode: "batch",
    targetEpisodes: 10,
  })

  assert.throws(() => extendProductionPlan(db, project.id, {
    mode: "batch",
    targetEpisodes: 10,
    existingEpisodeNumbers: [1, 2, 3],
  }), /必须大于/)
})
