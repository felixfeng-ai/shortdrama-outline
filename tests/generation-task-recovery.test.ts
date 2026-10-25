import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { GET as getGenerations } from "../app/api/generations/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  createGenerationTask,
  getGenerationTask,
  markGenerationTaskRunning,
  reconcileStaleGenerationTasks,
} from "../lib/generation/repo.ts"

const OWNER = `anon_${"t".repeat(48)}`

function makeTask(projectId: string, targetId: string) {
  const db = getDbForRequest()
  const task = createGenerationTask(db, {
    projectId,
    targetType: "character",
    targetId,
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "portrait",
  })
  return { db, task }
}

test("超过安全时限的 queued/running 任务转为可重试失败，近期任务保持运行", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "recovery", OWNER)
  const now = Date.now()
  const oldQueued = makeTask(project.id, "char-old-queued").task
  const oldRunning = makeTask(project.id, "char-old-running").task
  const freshRunning = makeTask(project.id, "char-fresh-running").task
  markGenerationTaskRunning(db, oldRunning.id)
  markGenerationTaskRunning(db, freshRunning.id)
  db.prepare("UPDATE generation_tasks SET created_at = ? WHERE id = ?").run(now - 11 * 60_000, oldQueued.id)
  db.prepare("UPDATE generation_tasks SET started_at = ? WHERE id = ?").run(now - 11 * 60_000, oldRunning.id)
  db.prepare("UPDATE generation_tasks SET started_at = ? WHERE id = ?").run(now - 2 * 60_000, freshRunning.id)

  const changed = reconcileStaleGenerationTasks(db, project.id, now, 10 * 60_000)
  assert.equal(changed, 2)
  const queued = getGenerationTask(db, oldQueued.id)
  const running = getGenerationTask(db, oldRunning.id)
  const fresh = getGenerationTask(db, freshRunning.id)
  assert.equal(queued?.status, "failed")
  assert.equal(running?.status, "failed")
  assert.match(queued?.error ?? "", /等待已中断/)
  assert.match(queued?.error ?? "", /远端任务可能仍会完成/)
  assert.equal(fresh?.status, "running")
})

test("任务恢复不跨项目，也不覆盖已完成、失败和取消终态", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const projectA = createProject(db, "recovery A", OWNER)
  const projectB = createProject(db, "recovery B", OWNER)
  const now = Date.now()
  const otherProject = makeTask(projectB.id, "char-b").task
  db.prepare("UPDATE generation_tasks SET created_at = ? WHERE id = ?").run(now - 11 * 60_000, otherProject.id)
  const finished = makeTask(projectA.id, "char-finished").task
  db.prepare("UPDATE generation_tasks SET status = 'succeeded', created_at = ?, finished_at = ? WHERE id = ?")
    .run(now - 11 * 60_000, now - 11 * 60_000, finished.id)

  const changed = reconcileStaleGenerationTasks(db, projectA.id, now, 10 * 60_000)
  assert.equal(changed, 0)
  assert.equal(getGenerationTask(db, otherProject.id)?.status, "queued")
  assert.equal(getGenerationTask(db, finished.id)?.status, "succeeded")
})

test("任务列表接口返回前会完成超时任务恢复", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "recovery api", OWNER)
  const { task } = makeTask(project.id, "char-api-stale")
  db.prepare("UPDATE generation_tasks SET created_at = ? WHERE id = ?")
    .run(Date.now() - 11 * 60_000, task.id)

  const response = await getGenerations(new Request(
    `http://localhost/api/generations?projectId=${project.id}`,
    { headers: { cookie: `chengju_sid=${OWNER}` } },
  ))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.data.tasks[0].status, "failed")
  assert.match(payload.data.tasks[0].error, /等待已中断/)
})

test("关键帧卡遇到未结束任务时提示可能仍在运行并禁止重复提交", () => {
  const panel = fs.readFileSync("components/KeyframePanel.tsx", "utf8")
  assert.ok(panel.includes("任务可能仍在运行"))
  assert.match(panel, /disabled=\{[^}]*pendingTask/)
})
