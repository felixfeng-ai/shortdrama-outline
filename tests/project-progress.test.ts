import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  buildProjectProgress,
  type ProjectProgressInput,
} from "../lib/project-progress.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  createGenerationTask,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"
import { readProjectProgress } from "../lib/project-progress.ts"

function baseInput(overrides: Partial<ProjectProgressInput> = {}): ProjectProgressInput {
  return {
    projectId: "project-progress",
    projectTitle: "进度测试",
    counts: {
      characters: 0,
      acts: 0,
      episodes: 0,
      visuals: 0,
      scenes: 0,
      shots: 0,
      images: 0,
      videos: 0,
    },
    completed: {
      characters: false,
      acts: false,
      episodes: false,
      visuals: false,
      scenes: false,
      shots: false,
    },
    todoItems: [{
      id: "start",
      text: "先在故事灵感里写下想法",
      step: "characters",
      kind: "next",
    }],
    productionStage: null,
    ...overrides,
  }
}

test("PP1 空项目返回唯一下一步且没有阻断", () => {
  const progress = buildProjectProgress(baseInput())

  assert.equal(progress.sixStep.currentKey, "characters")
  assert.equal(progress.sixStep.completed, 0)
  assert.equal(progress.sixStep.percentage, 0)
  assert.equal(progress.blocker, null)
  assert.equal(progress.nextAction?.step, "characters")
  assert.match(progress.nextAction?.text ?? "", /想法/)
  assert.equal(progress.productionStage.key, "source")
})

test("PP2 唯一阻断优先使用 fix，下一步继续使用 next", () => {
  const progress = buildProjectProgress(baseInput({
    counts: {
      characters: 3,
      acts: 3,
      episodes: 3,
      visuals: 3,
      scenes: 0,
      shots: 0,
      images: 3,
      videos: 0,
    },
    completed: {
      characters: true,
      acts: true,
      episodes: true,
      visuals: true,
      scenes: false,
      shots: false,
    },
    todoItems: [
      { id: "next", text: "下一步：生成场景", step: "scenes", kind: "next" },
      { id: "missing-refs", text: "有 2 个镜头缺参考图", step: "visuals", kind: "fix" },
      { id: "rework-shots", text: "有 1 个镜头需返修", step: "shots", kind: "fix" },
    ],
  }))

  assert.equal(progress.blocker?.id, "missing-refs")
  assert.equal(progress.blocker?.step, "visuals")
  assert.equal(progress.nextAction?.id, "next")
  assert.equal(progress.nextAction?.step, "scenes")
  assert.equal(progress.counts.images, 3)
})

test("PP3 生产计划存在时以计划阶段为准", () => {
  const progress = buildProjectProgress(baseInput({
    productionStage: {
      key: "shots",
      label: "分镜与视频",
      position: 6,
      total: 8,
      status: "generating",
      planStatus: "active",
    },
  }))

  assert.equal(progress.productionStage.key, "shots")
  assert.equal(progress.productionStage.label, "分镜与视频")
  assert.equal(progress.productionStage.percentage, 88)
})

test("PP4 API 与工作台复用同一 DTO 构建器和缓存策略", () => {
  const route = fs.readFileSync("app/api/projects/[id]/progress/route.ts", "utf8")
  const home = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")
  const dto = fs.readFileSync("lib/project-progress.ts", "utf8")

  assert.match(route, /readProjectProgress/)
  assert.match(dto, /buildProjectProgress/)
  assert.match(route, /assertProjectAccess/)
  assert.match(route, /no-store/)
  assert.match(home, /buildProjectProgress/)
  assert.match(home, /progress\.blocker/)
  assert.match(home, /progress\.nextAction/)
})

test("PP5 数据库读取使用最新快照与已采用图片/视频计数", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "DTO 数据库测试", "local")
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      id: "shot-1",
      entityId: "entity-1",
      episode: 1,
      shot: 1,
      characters: [],
      prompt: "",
      refImages: [],
      missingRefFor: [],
      status: "done",
    }],
  })
  const imageTask = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "entity-1",
    providerId: "test",
    model: "test",
    prompt: "image",
    mediaKind: "image",
  })
  const image = saveGeneratedAsset(db, {
    taskId: imageTask.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "entity-1",
    storageKey: `generated/${project.id}/image.png`,
    mime: "image/png",
    bytes: 1,
    providerId: "test",
    model: "test",
    prompt: "image",
    mediaKind: "image",
  })
  selectGeneratedAsset(db, project.id, image.id)
  const videoTask = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "entity-1",
    providerId: "test",
    model: "test",
    prompt: "video",
    mediaKind: "video",
  })
  const video = saveGeneratedAsset(db, {
    taskId: videoTask.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "entity-1",
    storageKey: `generated/${project.id}/video.mp4`,
    mime: "video/mp4",
    bytes: 1,
    providerId: "test",
    model: "test",
    prompt: "video",
    mediaKind: "video",
  })
  selectGeneratedAsset(db, project.id, video.id)

  const progress = readProjectProgress(db, project.id)
  assert.equal(progress.counts.images, 1)
  assert.equal(progress.counts.videos, 1)
  assert.equal(progress.sixStep.currentKey, "characters")
  assert.equal(progress.sixStep.steps.find((step) => step.key === "shots")?.completed, true)
})
