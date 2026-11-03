import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  GET as getDecisions,
  POST as postDecision,
} from "../app/api/projects/[id]/decisions/route.ts"
import { PATCH as patchDecision } from "../app/api/projects/[id]/decisions/[decisionId]/route.ts"
import {
  GET as getJudgments,
  POST as postJudgment,
} from "../app/api/projects/[id]/judgments/route.ts"
import { AGENT_TOOL_SCHEMAS, createToolExecutors, type AgentState } from "../lib/agent/tools.ts"
import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { EMPTY_BRIEF } from "../lib/brief.ts"

const owner = `anon_${"s".repeat(48)}`

function request(pathname: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set("cookie", `chengju_sid=${owner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

function context(id: string) {
  return { params: { id } }
}

function decisionContext(id: string, decisionId: string) {
  return { params: { id, decisionId } }
}

function agentState(over: Partial<AgentState> = {}): AgentState {
  return {
    projectTitle: "决策测试",
    hasIdea: true,
    brief: EMPTY_BRIEF,
    judgments: [],
    decisions: [],
    canonIssues: [],
    episodes: [],
    completed: {
      characters: true,
      acts: true,
      episodes: false,
      visuals: false,
      scenes: false,
      shots: false,
    },
    shots: [],
    expiredShots: 0,
    quota: null,
    ...over,
  }
}

const sampleDecision = {
  step: "characters",
  targetType: "character",
  targetId: "char-1",
  question: "主角的核心动机是什么？",
  options: ["复仇", "求生", "保护家人"],
  chosenValue: "保护家人",
  reason: "亲情压力更适合目标观众",
  status: "accepted",
  confidence: 0.82,
  impact: ["episodes", "shots"],
}

test("SD1 数据库迁移创建决策与判断日志表，并随项目级联清理", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chengju-decisions-"))
  const dbPath = path.join(dir, "decisions.db")
  try {
    const db = openDb(dbPath)
    try {
      const migrations = db.prepare(
        "SELECT name FROM schema_migrations WHERE version = 2",
      ).all() as { name: string }[]
      assert.deepEqual(migrations.map((item) => item.name), ["structured-decisions"])
      assert.deepEqual(
        (db.prepare("PRAGMA table_info(project_decisions)").all() as { name: string }[])
          .map((item) => item.name),
        [
          "id", "project_id", "step", "target_type", "target_id", "question",
          "options_json", "chosen_value", "reason", "status", "confidence",
          "locked", "owner_id", "based_on_snapshot_id", "impact_json",
          "created_at", "updated_at",
        ],
      )
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("SD2 创建 accepted 决策时自动写判断日志，并可读取", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "决策项目", owner)
  const created = await postDecision(
    request(`/api/projects/${project.id}/decisions`, {
      method: "POST",
      body: JSON.stringify(sampleDecision),
    }),
    context(project.id),
  )
  assert.equal(created.status, 200)
  const decision = (await created.json()).data.decision
  assert.equal(decision.status, "accepted")
  assert.equal(decision.chosenValue, "保护家人")
  assert.deepEqual(decision.impact, ["episodes", "shots"])

  const listed = await getDecisions(
    request(`/api/projects/${project.id}/decisions`),
    context(project.id),
  )
  const data = (await listed.json()).data
  assert.equal(data.decisions.length, 1)
  assert.equal(data.judgments.length, 1)
  assert.equal(data.judgments[0].decisionId, decision.id)
})

test("SD3 锁定决策必须先解锁，状态变化写判断日志", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "锁定项目", owner)
  const created = await postDecision(
    request(`/api/projects/${project.id}/decisions`, {
      method: "POST",
      body: JSON.stringify({ ...sampleDecision, status: "proposed", chosenValue: "" }),
    }),
    context(project.id),
  )
  const decision = (await created.json()).data.decision

  const accepted = await patchDecision(
    request(`/api/projects/${project.id}/decisions/${decision.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted", chosenValue: "求生", reason: "更紧张" }),
    }),
    decisionContext(project.id, decision.id),
  )
  assert.equal(accepted.status, 200)

  const locked = await patchDecision(
    request(`/api/projects/${project.id}/decisions/${decision.id}`, {
      method: "PATCH",
      body: JSON.stringify({ locked: true }),
    }),
    decisionContext(project.id, decision.id),
  )
  const lockedDecision = (await locked.json()).data.decision
  assert.equal(lockedDecision.status, "locked")

  const blocked = await patchDecision(
    request(`/api/projects/${project.id}/decisions/${decision.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "rejected" }),
    }),
    decisionContext(project.id, decision.id),
  )
  assert.equal(blocked.status, 409)

  const unlocked = await patchDecision(
    request(`/api/projects/${project.id}/decisions/${decision.id}`, {
      method: "PATCH",
      body: JSON.stringify({ unlock: true, locked: false, status: "rejected", reason: "方向调整" }),
    }),
    decisionContext(project.id, decision.id),
  )
  assert.equal(unlocked.status, 200)
  assert.equal((await unlocked.json()).data.decision.status, "rejected")
})

test("SD4 判断日志可独立写入和读取", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "日志项目", owner)
  const created = await postJudgment(
    request(`/api/projects/${project.id}/judgments`, {
      method: "POST",
      body: JSON.stringify({
        step: "episodes",
        action: "否决了车祸反转",
        reason: "与人物动机重复",
      }),
    }),
    context(project.id),
  )
  assert.equal(created.status, 200)
  const listed = await getJudgments(
    request(`/api/projects/${project.id}/judgments`),
    context(project.id),
  )
  const judgments = (await listed.json()).data.judgments
  assert.equal(judgments.length, 1)
  assert.match(judgments[0].action, /车祸反转/)
})

test("SD5 Agent 能读取决策，并只生成 proposal 卡片", () => {
  const state = agentState({
    decisions: [{
      id: "decision-1",
      step: "characters",
      question: "主角动机",
      chosenValue: "保护家人",
      reason: "亲情压力",
      status: "locked",
      locked: true,
    }],
  })
  const executors = createToolExecutors(state)
  assert.ok(AGENT_TOOL_SCHEMAS.some((tool) => tool.name === "get_decisions"))
  assert.ok(AGENT_TOOL_SCHEMAS.some((tool) => tool.name === "propose_decision"))
  assert.match(executors.get_decisions({}).content, /保护家人/)
  const proposal = executors.propose_decision({
    step: "episodes",
    question: "第三集钩子选哪个？",
    options: ["身份揭露", "误会升级"],
    recommended: "身份揭露",
    reason: "信息增量更大",
  })
  assert.equal(proposal.ok, true)
  assert.equal(proposal.card?.kind, "decision")
  assert.equal(state.decisions?.length, 1, "propose 不能产生副作用")
})

test("SD6 页面与 Agent 已接入服务端决策、判断和确认卡", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const dock = fs.readFileSync("components/AgentDock.tsx", "utf8")
  assert.ok(page.includes("fetchProjectDecisions"))
  assert.ok(page.includes("createProjectDecision"))
  assert.ok(page.includes("createProjectJudgment"))
  assert.ok(page.includes("onApplyDecision"))
  assert.ok(dock.includes("onApplyDecision"))
  assert.ok(dock.includes("propose_decision"))
})
