import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb, getDataDir } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests } from "../lib/assets/store.ts"
import { POST as postProject } from "../app/api/projects/route.ts"
import {
  getQuickTrialRun,
  updateQuickTrialRun,
  upsertQuickTrialRun,
} from "../lib/production/quick-trial-repo.ts"

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

test("QTR1 快速试片只推进最后完成阶段，并持久化视觉费用确认", () => {
  const db = openDb(tmpDbPath("quick-trial-runner"))
  const project = createProject(db, "断点恢复项目")

  const started = upsertQuickTrialRun(db, {
    projectId: project.id,
    idea: "被赶出家门的继承人用一封信夺回公司",
    phase: "start",
    status: "active",
  })
  assert.equal(started.phase, "start")
  assert.equal(started.visualApproved, false)

  const charactersDone = updateQuickTrialRun(db, project.id, {
    phase: "characters",
  })
  assert.equal(charactersDone?.phase, "characters")
  assert.equal(getQuickTrialRun(db, project.id)?.phase, "characters")

  const failedAtActs = updateQuickTrialRun(db, project.id, {
    status: "failed",
    error: "三幕生成中断",
  })
  assert.equal(failedAtActs?.phase, "characters")
  assert.equal(failedAtActs?.status, "failed")
  assert.equal(failedAtActs?.error, "三幕生成中断")

  const approved = updateQuickTrialRun(db, project.id, {
    visualApproved: true,
    status: "active",
    error: null,
  })
  assert.equal(approved?.visualApproved, true)
  assert.equal(approved?.phase, "characters")
})

test("QTR2 页面恢复从仓库读取断点，视觉确认复用客户端状态", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const client = fs.readFileSync("lib/production/quick-trial-client.ts", "utf8")

  assert.match(client, /fetchQuickTrialRun/)
  assert.match(client, /startQuickTrialRun/)
  assert.match(client, /markQuickTrialVisualApproved/)
  assert.match(page, /loadProject/)
  assert.match(page, /resumeQuickTrialRun/)
  assert.match(page, /quickTrialRun/)
  assert.doesNotMatch(page, /quickTrial[\s\S]{0,200}generateShotVideo/)
})

test("QTR3 快速试片状态 API 校验项目权限并回读最后完成阶段", async () => {
  __resetDbForTests(":memory:")
  const created = await (await postProject(json({ title: "快速试片 API" }))).json()
  const projectId = created.data.project.id as string
  const { GET, PATCH, POST } = await import(
    "../app/api/projects/[id]/quick-trial/route.ts"
  )

  const started = await POST(json({
    idea: "外卖员收到十年前失踪妹妹寄来的录音",
  }), routeContext(projectId))
  assert.equal(started.status, 200)

  const characters = await PATCH(json({
    phase: "characters",
    status: "active",
  }, "PATCH"), routeContext(projectId))
  assert.equal(characters.status, 200)

  const approved = await PATCH(json({
    visualApproved: true,
    status: "failed",
    error: "定妆生成中断",
  }, "PATCH"), routeContext(projectId))
  const approvedPayload = await approved.json()
  assert.equal(approvedPayload.data.run.phase, "characters")
  assert.equal(approvedPayload.data.run.visualApproved, true)

  const read = await GET(
    new Request(`http://localhost/api/projects/${projectId}/quick-trial`),
    routeContext(projectId),
  )
  const readPayload = await read.json()
  assert.equal(readPayload.data.run.error, "定妆生成中断")

  const forbidden = await GET(
    new Request("http://localhost/api/projects/forbidden/quick-trial"),
    routeContext("00000000-0000-4000-8000-000000000000"),
  )
  assert.equal(forbidden.status, 403)
})
