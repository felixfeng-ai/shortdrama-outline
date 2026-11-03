import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { GET as getCanon, POST as postCanon } from "../app/api/projects/[id]/canon/route.ts"
import { AGENT_TOOL_SCHEMAS, createToolExecutors, type AgentState } from "../lib/agent/tools.ts"
import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { EMPTY_BRIEF } from "../lib/brief.ts"

const owner = `anon_${"c".repeat(48)}`

function request(pathname: string, init: RequestInit = {}, cookieOwner = owner): Request {
  const headers = new Headers(init.headers)
  headers.set("cookie", `chengju_sid=${cookieOwner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

function context(id: string) {
  return { params: { id } }
}

function state(over: Partial<AgentState> = {}): AgentState {
  return {
    projectTitle: "Canon 测试",
    hasIdea: true,
    brief: EMPTY_BRIEF,
    judgments: [],
    decisions: [],
    canonIssues: [],
    episodes: [],
    completed: {
      characters: true,
      acts: true,
      episodes: true,
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

async function addFact(
  projectId: string,
  input: Record<string, unknown>,
): Promise<Response> {
  return postCanon(
    request(`/api/projects/${projectId}/canon`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
    context(projectId),
  )
}

test("C1 数据库迁移创建 Canon 实体与事实表", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chengju-canon-"))
  const dbPath = path.join(dir, "canon.db")
  try {
    const db = openDb(dbPath)
    try {
      const migration = db.prepare(
        "SELECT name FROM schema_migrations WHERE version = 3",
      ).get() as { name: string }
      assert.equal(migration.name, "canon-facts")
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('canon_entities','canon_facts') ORDER BY name",
      ).all() as { name: string }[]
      assert.deepEqual(tables.map((item) => item.name), ["canon_entities", "canon_facts"])
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("C2 重叠区间不同事实报冲突，不重叠区间不误报", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "Canon 项目", owner)
  assert.equal((await addFact(project.id, {
    kind: "character",
    name: "林远",
    field: "knowledge:secret",
    value: "知道",
    validFromEpisode: 1,
    validToEpisode: 10,
  })).status, 200)
  assert.equal((await addFact(project.id, {
    kind: "character",
    name: "林远",
    field: "knowledge:secret",
    value: "不知道",
    validFromEpisode: 5,
    validToEpisode: 8,
  })).status, 200)
  assert.equal((await addFact(project.id, {
    kind: "character",
    name: "林远",
    field: "knowledge:secret",
    value: "确认死亡",
    validFromEpisode: 11,
    validToEpisode: 15,
  })).status, 200)

  const response = await getCanon(
    request(`/api/projects/${project.id}/canon`),
    context(project.id),
  )
  const data = (await response.json()).data
  assert.equal(data.facts.length, 3)
  assert.ok(data.issues.some((issue: { code: string }) => issue.code === "overlapping-values"))
  const overlap = data.issues.find((issue: { code: string }) => issue.code === "overlapping-values")
  assert.match(overlap.message, /1-10|5-8/)
})

test("C3 非法集数范围与重复事实被正确处理", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "Canon 校验", owner)
  const invalid = await addFact(project.id, {
    kind: "prop",
    name: "钥匙",
    field: "state",
    value: "完好",
    validFromEpisode: 10,
    validToEpisode: 2,
  })
  assert.equal(invalid.status, 400)

  const payload = {
    kind: "prop",
    name: "钥匙",
    field: "state",
    value: "完好",
    validFromEpisode: 1,
    validToEpisode: 5,
  }
  assert.equal((await addFact(project.id, payload)).status, 200)
  assert.equal((await addFact(project.id, payload)).status, 200)
  const response = await getCanon(
    request(`/api/projects/${project.id}/canon`),
    context(project.id),
  )
  assert.equal((await response.json()).data.facts.length, 1)
})

test("C4 Canon 项目归属隔离", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "Canon 私有", owner)
  const forbidden = await getCanon(
    request(`/api/projects/${project.id}/canon`, {}, `anon_${"x".repeat(48)}`),
    context(project.id),
  )
  assert.equal(forbidden.status, 403)
})

test("C5 Agent audit_canon 返回实体、字段与集数范围", () => {
  const executors = createToolExecutors(state({
    canonIssues: [{
      code: "overlapping-values",
      severity: "error",
      entityName: "林远",
      field: "knowledge:secret",
      message: "林远 knowledge:secret 在 5-8 集与 1-10 集冲突：不知道 / 知道",
    }],
  }))
  assert.ok(AGENT_TOOL_SCHEMAS.some((tool) => tool.name === "audit_canon"))
  const result = executors.audit_canon({})
  assert.equal(result.ok, true)
  assert.match(result.content, /林远/)
  assert.match(result.content, /5-8/)
})

test("C6 页面提供只读 Canon 面板", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const panel = fs.readFileSync("components/CanonPanel.tsx", "utf8")
  assert.ok(page.includes("fetchProjectCanon"))
  assert.ok(page.includes("<CanonPanel"))
  assert.ok(panel.includes("Canon"))
  assert.ok(panel.includes("冲突"))
})
