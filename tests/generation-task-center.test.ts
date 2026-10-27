import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  generationTaskTargetLabel,
  selectRetryableTasks,
  summarizeGenerationTasks,
} from "../lib/generation/task-view.ts"
import type { GenerationTask } from "../lib/generation/types.ts"
import { placeGenerationTargetId } from "../lib/assets/anchors.ts"

function task(patch: Partial<GenerationTask>): GenerationTask {
  return {
    id: "task-1",
    projectId: "project-1",
    targetType: "character",
    targetId: "char-1",
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "portrait",
    promptHash: "hash",
    status: "failed",
    error: "failed",
    assetId: null,
    createdAt: 100,
    startedAt: 110,
    finishedAt: 120,
    ...patch,
  }
}

test("TC1.1 任务状态汇总包含运行、等待、成功、失败和取消", () => {
  const summary = summarizeGenerationTasks([
    task({ id: "1", status: "queued" }),
    task({ id: "2", status: "running" }),
    task({ id: "3", status: "succeeded" }),
    task({ id: "4", status: "failed" }),
    task({ id: "5", status: "canceled" }),
  ])
  assert.deepEqual(summary.counts, {
    queued: 1,
    running: 1,
    succeeded: 1,
    failed: 1,
    canceled: 1,
  })
  assert.match(summary.label, /1 运行/)
  assert.match(summary.label, /1 失败/)
})

test("TC3.3 每个目标只重试最新失败或取消任务，旧失败不重复调用", () => {
  const tasks = [
    task({ id: "old-fail", targetId: "char-1", status: "failed", createdAt: 100 }),
    task({ id: "new-success", targetId: "char-1", status: "succeeded", createdAt: 200 }),
    task({ id: "shot-old", targetType: "shot", targetId: "shot-1", status: "failed", createdAt: 100 }),
    task({ id: "shot-canceled", targetType: "shot", targetId: "shot-1", status: "canceled", createdAt: 200 }),
    task({ id: "shot-latest-running", targetType: "shot", targetId: "shot-1", status: "running", createdAt: 300 }),
    task({ id: "char-fail", targetId: "char-2", status: "failed", createdAt: 300 }),
  ]
  assert.deepEqual(selectRetryableTasks(tasks).map((item) => item.id), ["char-fail"])
})

test("TC2.1 目标标签使用真实角色和镜头信息", () => {
  const label = generationTaskTargetLabel(
    task({ targetType: "shot", targetId: "shot-entity-1" }),
    [{ id: "v1", name: "林远", age: "", face: "", hair: "", marks: "", wardrobe: "", props: "", anchor: "", entityId: "char-1" }],
    [{
      id: "s1", entityId: "shot-entity-1", shot: 3, episode: 2, scene: "天台", characters: ["林远"],
      action: "", speaker: "", dialogue: "", place: "天台", shotSize: "中景", camera: "固定",
      prompt: "", refImages: [], missingRefFor: [], params: { ratio: "9:16", duration: 10, lastFrame: false }, status: "todo",
    }],
  )
  assert.equal(label, "第 2 集 · 第 3 镜 · 天台")
})

test("PG-R4.1 任务中心用真实地点名标记地点任务", () => {
  const name = "外门弟子通铺外"
  const label = generationTaskTargetLabel(
    task({ targetType: "place", targetId: placeGenerationTargetId(name) }),
    [],
    [],
    [{
      id: "place-1",
      name,
      space: "通铺与木栅栏",
      props: "旧木箱",
      lighting: "清晨冷光",
      grade: "灰绿",
      anchor: "space: 通铺与木栅栏",
    }],
  )
  assert.equal(label, `地点 · ${name}`)
})

test("TC1/TC3 页面挂载任务中心，支持确认后串行批量重试", () => {
  const component = fs.readFileSync("components/GenerationTaskPanel.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const keyframe = fs.readFileSync("components/KeyframePanel.tsx", "utf8")

  assert.ok(component.includes("重试失败项"), "缺少批量重试入口")
  assert.ok(component.includes("确认重试"), "批量重试没有确认态")
  assert.ok(component.includes("for (const task of"), "批量重试没有串行执行")
  assert.ok(page.includes("<GenerationTaskPanel"), "页面没有挂载任务中心")
  assert.ok(page.includes("<GenerationTaskPanel") && page.includes("places={places}"), "地点任务没有传给任务中心")
  assert.ok(keyframe.includes("chengju:generation-updated"), "关键帧状态变化没有通知任务中心")
  assert.ok(component.includes("task.targetType === 'place'"), "地点任务没有独立宽高比")
  assert.ok(component.includes("'landscape'"), "地点任务重试应使用横图")
})
