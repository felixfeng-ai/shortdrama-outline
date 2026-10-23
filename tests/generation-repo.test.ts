import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject, deleteProject } from "../lib/assets/repo.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  failGenerationTask,
  listGeneratedAssets,
  listGenerationTasks,
  markGenerationTaskRunning,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"

function setup() {
  const db = openDb(":memory:")
  const project = createProject(db, "关键帧测试", "owner-a")
  return { db, project }
}

test("G2.1 每次生成先建 queued 任务，再进入 running", () => {
  const { db, project } = setup()
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-entity-1",
    providerId: "siliconflow",
    model: "Kwai-Kolors/Kolors",
    prompt: "rainy alley, cinematic",
  })

  assert.equal(task.status, "queued")
  assert.ok(task.id)
  assert.equal(task.promptHash.length, 64)

  const running = markGenerationTaskRunning(db, task.id)
  assert.equal(running.status, "running")
  assert.ok(running.startedAt)
  assert.equal(listGenerationTasks(db, project.id, "shot", "shot-entity-1").length, 1)
})

test("G2.2 成功后任务与资产互相引用，资产可按目标恢复", () => {
  const { db, project } = setup()
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "character",
    targetId: "character-entity-1",
    providerId: "openai",
    model: "gpt-image-1",
    prompt: "character portrait",
  })
  markGenerationTaskRunning(db, task.id)

  const asset = saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: project.id,
    targetType: "character",
    targetId: "character-entity-1",
    storageKey: `generated/${project.id}/poster.png`,
    mime: "image/png",
    bytes: 128,
    providerId: "openai",
    model: "gpt-image-1",
    prompt: "character portrait",
  })
  const completed = completeGenerationTask(db, task.id, asset.id)

  assert.equal(completed.status, "succeeded")
  assert.equal(completed.assetId, asset.id)
  assert.equal(asset.selectedAt, null)

  const assets = listGeneratedAssets(db, project.id, "character", "character-entity-1")
  assert.deepEqual(assets.map((item) => item.id), [asset.id])
  assert.equal(assets[0].downloadUrl, `/api/generated-assets/${asset.id}`)
})

test("G3.2 回选旧版本：同一目标只保留一个采用版本，历史不删除", () => {
  const { db, project } = setup()
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-entity-1",
    providerId: "siliconflow",
    model: "model-a",
    prompt: "first keyframe",
  })
  const first = saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-entity-1",
    storageKey: `generated/${project.id}/v1.png`,
    mime: "image/png",
    bytes: 64,
    providerId: "siliconflow",
    model: "model-a",
    prompt: "first keyframe",
  })
  const second = saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-entity-1",
    storageKey: `generated/${project.id}/v2.png`,
    mime: "image/png",
    bytes: 64,
    providerId: "siliconflow",
    model: "model-a",
    prompt: "first keyframe",
  })

  selectGeneratedAsset(db, project.id, second.id)
  selectGeneratedAsset(db, project.id, first.id)
  const assets = listGeneratedAssets(db, project.id, "shot", "shot-entity-1")

  assert.equal(assets.length, 2)
  assert.deepEqual(assets.map((item) => item.id), [first.id, second.id])
  assert.ok(assets[0].selectedAt)
  assert.equal(assets[1].selectedAt, null)
})

test("G2.3 失败任务保留可读错误，但不产出资产", () => {
  const { db, project } = setup()
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-entity-2",
    providerId: "openai",
    model: "gpt-image-1",
    prompt: "a portrait",
  })
  markGenerationTaskRunning(db, task.id)
  const failed = failGenerationTask(db, task.id, "Provider 超时")

  assert.equal(failed.status, "failed")
  assert.equal(failed.error, "Provider 超时")
  assert.equal(listGeneratedAssets(db, project.id, "shot", "shot-entity-2").length, 0)
})

test("P2c 删除项目会级联清掉生成任务与关键帧记录", () => {
  const { db, project } = setup()
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-entity-3",
    providerId: "openai",
    model: "gpt-image-1",
    prompt: "delete me",
  })
  saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-entity-3",
    storageKey: `generated/${project.id}/delete.png`,
    mime: "image/png",
    bytes: 12,
    providerId: "openai",
    model: "gpt-image-1",
    prompt: "delete me",
  })

  assert.equal(deleteProject(db, project.id, "owner-a"), true)
  assert.equal(listGenerationTasks(db, project.id, "shot", "shot-entity-3").length, 0)
  assert.equal(listGeneratedAssets(db, project.id, "shot", "shot-entity-3").length, 0)
})
