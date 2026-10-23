import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  cancelGenerationTask,
  createGenerationTask,
  getGenerationTask,
  markGenerationTaskRunning,
} from "../lib/generation/repo.ts"
import { runImageGeneration } from "../lib/generation/service.ts"

function setup() {
  const db = openDb(":memory:")
  const project = createProject(db, "任务取消测试", "owner-a")
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "portrait",
  })
  markGenerationTaskRunning(db, task.id)
  return { db, project, task }
}

test("T1.1 运行中的任务可以取消，状态与结束时间被记录", () => {
  const { db, task } = setup()
  const canceled = cancelGenerationTask(db, task.id, "已停止等待")
  assert.equal(canceled.status, "canceled")
  assert.equal(canceled.error, "已停止等待")
  assert.ok(canceled.finishedAt)
  assert.equal(getGenerationTask(db, task.id)?.status, "canceled")
})

test("T1.1 外部取消信号会中断服务请求", async () => {
  const controller = new AbortController()
  const fakeFetch = async () => {
    controller.abort()
    throw new DOMException("Aborted", "AbortError")
  }
  await assert.rejects(
    () => runImageGeneration({
      prompt: "portrait",
      aspect: "portrait",
      seed: 1,
      signal: controller.signal,
    }, fakeFetch as typeof fetch, {
      ALIYUN_DASHSCOPE_API_KEY: "server-secret",
      ALIYUN_IMAGE_MODEL: "wanx2.1-t2i-turbo",
    }, async () => {}),
    (error: Error) => error.name === "AbortError" || /abort/i.test(error.message),
  )
})

test("T2.1/T3.1 界面提供停止、取消状态和失败重试", () => {
  const panel = fs.readFileSync("components/KeyframePanel.tsx", "utf8")
  const client = fs.readFileSync("lib/generation/client.ts", "utf8")
  const route = fs.readFileSync("app/api/generations/route.ts", "utf8")
  const types = fs.readFileSync("lib/generation/types.ts", "utf8")

  assert.ok(panel.includes("停止生成"), "缺少停止生成按钮")
  assert.ok(panel.includes("AbortController"), "前端没有中断请求")
  assert.ok(panel.includes("已停止等待"), "取消后没有明确状态")
  assert.ok(panel.includes("重试生成"), "失败后没有重试文案")
  assert.ok(client.includes("signal"), "客户端请求没有透传中断信号")
  assert.ok(route.includes("cancelGenerationTask"), "服务端没有写入取消状态")
  assert.ok(types.includes('"canceled"'), "任务类型没有取消状态")
})
