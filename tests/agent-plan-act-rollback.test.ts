import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  applyAgentAction,
  listAgentActionRuns,
  rollbackAgentAction,
  AgentRunConflictError,
} from "../lib/agent/runs.ts"
import { buildAgentActionPlan } from "../lib/agent/plan.ts"
import type { AgentCard } from "../lib/agent/tools.ts"
import {
  GET as getAgentRuns,
  POST as postAgentRun,
} from "../app/api/projects/[id]/agent-runs/route.ts"
import { POST as postRollback } from "../app/api/projects/[id]/agent-runs/[runId]/rollback/route.ts"
import { createProject, createSnapshot, latestSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const owner = `anon_${"a".repeat(48)}`

const card: AgentCard = {
  kind: "shot-edit",
  targetId: "shot-stable",
  shot: 3,
  episode: 1,
  targetLabel: "第 1 集 · 第 3 镜",
  target: "action",
  expectedText: "他站在原地。",
  text: "他回头看向最后一盏灯。",
  summary: "补一个明确的回头动作",
}

const beforePayload = [{
  id: "shot-row",
  entityId: "shot-stable",
  episode: 1,
  shot: 3,
  action: "他站在原地。",
}]

const afterPayload = [{
  ...beforePayload[0],
  action: "他回头看向最后一盏灯。",
}]

function request(pathname: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (!headers.has("cookie")) headers.set("cookie", `chengju_sid=${owner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

function seedProject() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "Agent 运行记录项目", owner)
  const before = createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: beforePayload,
  })
  return { db, project, before }
}

function actionInput(projectId: string) {
  return {
    projectId,
    ownerId: owner,
    actionKind: "shot-edit" as const,
    artifactKind: "shots" as const,
    targetType: "shot" as const,
    targetId: "shot-stable",
    targetLabel: "第 1 集 · 第 3 镜",
    field: "action",
    summary: "补一个明确的回头动作",
    beforePayload,
    afterPayload,
  }
}

test("AP1 可写卡片生成执行计划，只读卡片不伪装成计划", () => {
  const plan = buildAgentActionPlan(card)
  assert.ok(plan)
  assert.equal(plan.artifactKind, "shots")
  assert.equal(plan.fieldLabel, "镜头动作")
  assert.equal(plan.before, "他站在原地。")
  assert.equal(plan.after, "他回头看向最后一盏灯。")
  assert.equal(plan.rollbackable, true)
  assert.match(plan.impact.join(" "), /新版本/)

  assert.equal(buildAgentActionPlan({
    kind: "video-plan",
    shotIds: ["s1"],
    shotCount: 1,
    durationSeconds: 5,
    model: "model",
    resolution: "720P",
    estimatedCostMicros: 100,
    budgetLimitMicros: 200,
  }), null)
})

test("AP1 实体计划映射到真实快照类型", () => {
  const fields = {
    character: "personality",
    place: "space",
    episode: "synopsis",
    shot: "action",
  } as const
  const plans = ([
    ["character", "characters"],
    ["place", "visualPlaces"],
    ["episode", "episodes"],
    ["shot", "shots"],
  ] as const).map(([targetType, artifactKind]) => buildAgentActionPlan({
    kind: "entity-edit",
    targetType,
    targetId: `${targetType}-1`,
    targetName: "目标",
    field: fields[targetType],
    expectedText: "旧值",
    text: "新值",
    summary: "更新字段",
  }))
  assert.deepEqual(
    plans.map((plan) => plan?.artifactKind),
    ["characters", "visualPlaces", "episodes", "shots"],
  )
})

test("AP2 执行动作原子保存 before/after 快照并复用一致 before", () => {
  const { db, project, before } = seedProject()
  const result = applyAgentAction(db, actionInput(project.id))

  assert.equal(result.run.status, "applied")
  assert.equal(result.run.beforeSnapshotId, before.id)
  assert.notEqual(result.run.afterSnapshotId, before.id)
  assert.deepEqual(result.afterSnapshot.payload, afterPayload)
  assert.equal(listAgentActionRuns(db, project.id).length, 1)

  const latest = latestSnapshot(db, project.id, "shots")
  assert.equal(latest?.id, result.run.afterSnapshotId)
})

test("AP3 回滚创建新版本而不是删除历史，并标记运行状态", () => {
  const { db, project } = seedProject()
  const applied = applyAgentAction(db, actionInput(project.id))
  const rolled = rollbackAgentAction(db, project.id, applied.run.id)

  assert.equal(rolled.run.status, "rolled_back")
  assert.deepEqual(rolled.payload, beforePayload)
  assert.equal(rolled.snapshot.version, 3)
  assert.equal(rolled.run.rollbackSnapshotId, rolled.snapshot.id)
  assert.equal(listAgentActionRuns(db, project.id)[0].status, "rolled_back")
})

test("AP3 目标已有后续版本时拒绝自动回滚", () => {
  const { db, project } = seedProject()
  const applied = applyAgentAction(db, actionInput(project.id))
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{ ...afterPayload[0], action: "用户之后又改了一次。" }],
  })

  assert.throws(
    () => rollbackAgentAction(db, project.id, applied.run.id),
    (error) => error instanceof AgentRunConflictError
      && error.code === "stale"
      && /新版本/.test(error.message),
  )
})

test("AP4 API 按项目隔离并返回执行记录", async () => {
  const { project } = seedProject()
  const created = await postAgentRun(
    request(`/api/projects/${project.id}/agent-runs`, {
      method: "POST",
      body: JSON.stringify(actionInput(project.id)),
    }),
    { params: { id: project.id } },
  )
  assert.equal(created.status, 200)
  const createdPayload = await created.json()
  const run = createdPayload.data.run
  assert.equal(run.status, "applied")

  const listed = await getAgentRuns(
    request(`/api/projects/${project.id}/agent-runs`),
    { params: { id: project.id } },
  )
  assert.equal(listed.status, 200)
  assert.equal((await listed.json()).data.runs.length, 1)

  const rolled = await postRollback(
    request(`/api/projects/${project.id}/agent-runs/${run.id}/rollback`, { method: "POST" }),
    { params: { id: project.id, runId: run.id } },
  )
  assert.equal(rolled.status, 200)
  assert.equal((await rolled.json()).data.run.status, "rolled_back")

  const denied = await getAgentRuns(
    request(`/api/projects/${project.id}/agent-runs`, {
      headers: { cookie: `chengju_sid=anon_${"z".repeat(48)}` },
    }),
    { params: { id: project.id } },
  )
  assert.equal(denied.status, 403)
})

test("AP3 API 将过期回滚映射为 409，不静默覆盖新版本", async () => {
  const { db, project } = seedProject()
  const created = await postAgentRun(
    request(`/api/projects/${project.id}/agent-runs`, {
      method: "POST",
      body: JSON.stringify(actionInput(project.id)),
    }),
    { params: { id: project.id } },
  )
  const run = (await created.json()).data.run
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{ ...afterPayload[0], action: "后续又改了一版。" }],
  })

  const stale = await postRollback(
    request(`/api/projects/${project.id}/agent-runs/${run.id}/rollback`, { method: "POST" }),
    { params: { id: project.id, runId: run.id } },
  )
  assert.equal(stale.status, 409)
  assert.match((await stale.json()).error, /新版本/)
})

test("AP1-AP3 Agent 面板接入计划、执行记录和回滚", () => {
  const dock = fs.readFileSync("components/AgentDock.tsx", "utf8")
  const panel = fs.existsSync("components/AgentRunPanel.tsx")
    ? fs.readFileSync("components/AgentRunPanel.tsx", "utf8")
    : ""
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.match(dock, /buildAgentActionPlan/)
  assert.match(dock, /执行计划/)
  assert.match(dock, /AgentRunPanel/)
  assert.match(dock, /refreshRuns/)
  assert.match(panel, /执行记录/)
  assert.match(panel, /确认回滚/)
  assert.match(panel, /SmoothCollapse/)
  assert.match(page, /onRollbackAgentRun/)
  assert.match(page, /rollbackAgentRun/)
  assert.match(css, /\.agent-run-panel/)
  assert.match(css, /\.agent-plan-brief/)
  assert.match(css, /@media \(max-width: 640px\)/)
})
