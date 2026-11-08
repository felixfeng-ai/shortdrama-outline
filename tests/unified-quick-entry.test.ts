import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb, getDataDir } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests } from "../lib/assets/store.ts"
import { POST as postProject } from "../app/api/projects/route.ts"
import {
  buildQuickCreationQuotes,
  quickTrialDisplayPhase,
  type QuickCreationVideoPrice,
  type QuickTrialRunDto,
} from "../lib/production/quick-trial.ts"
import {
  getQuickTrialRun,
  upsertQuickTrialRun,
} from "../lib/production/quick-trial-repo.ts"

function tmpDbPath(tag: string): string {
  return `${getDataDir()}/tmp/test-${tag}-${process.pid}-${Date.now()}.db`
}

const videoPrice: QuickCreationVideoPrice = {
  enabled: true,
  model: "MiniMax-H3-Lite",
  resolution: "480P",
  durationSeconds: 5,
  costMicros: 800_000,
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

test("UQE1 快速创作按故事、首帧和视频范围给出统一预算", () => {
  const quotes = buildQuickCreationQuotes(videoPrice)

  assert.equal(quotes.story.units, 5)
  assert.equal(quotes.story.totalMicros, 500_000)
  assert.equal(quotes.keyframe.units, 23)
  assert.equal(quotes.keyframe.totalMicros, 2_300_000)
  assert.equal(quotes.video.units, 31)
  assert.equal(quotes.video.videoCostMicros, 800_000)
  assert.equal(quotes.video.totalMicros, 3_100_000)
  assert.equal(quotes.video.available, true)
  assert.deepEqual(quotes.video.steps, ["人物", "三幕", "第一集", "定妆", "场次", "分镜", "5 张首帧", "镜头视频"])
})

test("UQE2 视频能力未启用时只关闭视频范围", () => {
  const quotes = buildQuickCreationQuotes({ ...videoPrice, enabled: false })
  assert.equal(quotes.story.available, true)
  assert.equal(quotes.keyframe.available, true)
  assert.equal(quotes.video.available, false)
  assert.match(quotes.video.unavailableReason ?? "", /视频生成|视频服务/)
})

test("UQE2b 完成状态按目标停在故事、首帧或视频", () => {
  const base: QuickTrialRunDto = {
    projectId: "p",
    idea: "idea",
    phase: "episodes",
    status: "completed",
    error: null,
    target: "story",
    budgetUnits: 5,
    budgetMicros: 500_000,
    visualApproved: false,
    videoApproved: false,
    videoBudgetMicros: 0,
    videoModel: null,
    videoResolution: null,
    videoDurationSeconds: 5,
    createdAt: 1,
    updatedAt: 1,
  }
  assert.equal(quickTrialDisplayPhase(base), "ready")
  assert.equal(quickTrialDisplayPhase({ ...base, target: "keyframe", phase: "visual-ready" }), "visual-ready")
  assert.equal(quickTrialDisplayPhase({ ...base, target: "video", phase: "video-ready" }), "video-ready")
})

test("UQE3 快速创作状态持久化范围、预算和视频参数", () => {
  const db = openDb(tmpDbPath("unified-quick-entry"))
  const project = createProject(db, "统一快速创作")
  const run = upsertQuickTrialRun(db, {
    projectId: project.id,
    idea: "外卖员收到失踪妹妹寄来的录音",
    phase: "start",
    status: "active",
    target: "video",
    budgetUnits: 23,
    budgetMicros: 2_300_000,
    visualApproved: true,
    videoApproved: true,
    videoModel: videoPrice.model,
    videoResolution: videoPrice.resolution,
    videoDurationSeconds: videoPrice.durationSeconds,
  })

  assert.equal(run.target, "video")
  assert.equal(run.budgetUnits, 23)
  assert.equal(run.budgetMicros, 2_300_000)
  assert.equal(run.videoApproved, true)
  assert.equal(run.videoModel, videoPrice.model)
  assert.equal(getQuickTrialRun(db, project.id)?.videoResolution, "480P")
})

test("UQE4 空项目只保留一个快速创作入口，旧快速出片不再作为新项目类型", () => {
  const onboarding = fs.readFileSync("components/WorkspaceOnboarding.tsx", "utf8")
  const picker = fs.readFileSync("components/ProjectTypePicker.tsx", "utf8")
  const progress = fs.readFileSync("components/QuickTrialProgress.tsx", "utf8")
  const quotes = fs.readFileSync("lib/production/quick-trial.ts", "utf8")

  assert.match(onboarding, /fetchQuickCreationQuotes/)
  assert.match(onboarding, /TARGETS/)
  assert.match(onboarding, /额度/)
  assert.match(onboarding, /开始快速创作/)
  assert.match(quotes, /故事样片/)
  assert.match(quotes, /动态分镜/)
  assert.match(quotes, /单镜头视频/)
  assert.doesNotMatch(picker, /value:\s*["']quick_video["']/)
  assert.match(progress, /镜头视频/)
})

test("UQE5 页面按目标执行，视频样片复用正式视频任务与冻结预算", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const client = fs.readFileSync("lib/production/quick-trial-client.ts", "utf8")

  assert.match(client, /fetchQuickCreationQuotes/)
  assert.match(client, /QuickCreationTarget/)
  assert.match(page, /startQuickTrial\([\s\S]{0,120}target/)
  assert.match(page, /generateShotVideo/)
  assert.match(page, /quickTrialRun\.videoBudgetMicros|videoBudgetMicros/)
  assert.match(page, /target === ["']story["']|target === ["']keyframe["']|target === ["']video["']/)
})

test("快速创作报价 API 返回三类可用性与统一预算", async () => {
  const previous = {
    enabled: process.env.VIDEO_GENERATION_ENABLED,
    key: process.env.MINIMAX_API_KEY,
    model: process.env.MINIMAX_VIDEO_MODEL,
    resolution: process.env.MINIMAX_VIDEO_RESOLUTION,
  }
  process.env.VIDEO_GENERATION_ENABLED = "1"
  process.env.MINIMAX_API_KEY = "test-key"
  process.env.MINIMAX_VIDEO_MODEL = "MiniMax-H3-Lite"
  process.env.MINIMAX_VIDEO_RESOLUTION = "480P"
  try {
    const { GET } = await import("../app/api/quick-creation/quote/route.ts")
    const response = await GET(new Request("http://localhost/api/quick-creation/quote"))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.data.quotes.story.units, 5)
    assert.equal(payload.data.quotes.video.units, 31)
    assert.equal(payload.data.quotes.video.available, true)
  } finally {
    if (previous.enabled === undefined) delete process.env.VIDEO_GENERATION_ENABLED
    else process.env.VIDEO_GENERATION_ENABLED = previous.enabled
    if (previous.key === undefined) delete process.env.MINIMAX_API_KEY
    else process.env.MINIMAX_API_KEY = previous.key
    if (previous.model === undefined) delete process.env.MINIMAX_VIDEO_MODEL
    else process.env.MINIMAX_VIDEO_MODEL = previous.model
    if (previous.resolution === undefined) delete process.env.MINIMAX_VIDEO_RESOLUTION
    else process.env.MINIMAX_VIDEO_RESOLUTION = previous.resolution
  }
})

test("快速创作 API 冻结目标预算，并允许在故事后升级到视频", async () => {
  const previous = {
    enabled: process.env.VIDEO_GENERATION_ENABLED,
    key: process.env.MINIMAX_API_KEY,
    model: process.env.MINIMAX_VIDEO_MODEL,
    resolution: process.env.MINIMAX_VIDEO_RESOLUTION,
  }
  process.env.VIDEO_GENERATION_ENABLED = "1"
  process.env.MINIMAX_API_KEY = "test-key"
  process.env.MINIMAX_VIDEO_MODEL = "MiniMax-H3-Lite"
  process.env.MINIMAX_VIDEO_RESOLUTION = "480P"
  __resetDbForTests(":memory:")
  try {
    const created = await (await postProject(json({ title: "统一快速创作" }))).json()
    const projectId = created.data.project.id as string
    const { PATCH, POST } = await import("../app/api/projects/[id]/quick-trial/route.ts")
    const started = await POST(json({
      idea: "外卖员收到失踪妹妹寄来的录音",
      target: "story",
    }), routeContext(projectId))
    const startedPayload = await started.json()
    assert.equal(started.status, 200)
    assert.equal(startedPayload.data.run.target, "story")
    assert.equal(startedPayload.data.run.budgetUnits, 5)
    assert.equal(startedPayload.data.run.visualApproved, false)

    const upgraded = await PATCH(json({
      target: "video",
      phase: "episodes",
      status: "active",
    }, "PATCH"), routeContext(projectId))
    const upgradedPayload = await upgraded.json()
    assert.equal(upgraded.status, 200)
    assert.equal(upgradedPayload.data.run.target, "video")
    assert.equal(upgradedPayload.data.run.budgetUnits, 31)
    assert.equal(upgradedPayload.data.run.videoApproved, true)
    assert.equal(upgradedPayload.data.run.videoBudgetMicros, 800_000)
  } finally {
    if (previous.enabled === undefined) delete process.env.VIDEO_GENERATION_ENABLED
    else process.env.VIDEO_GENERATION_ENABLED = previous.enabled
    if (previous.key === undefined) delete process.env.MINIMAX_API_KEY
    else process.env.MINIMAX_API_KEY = previous.key
    if (previous.model === undefined) delete process.env.MINIMAX_VIDEO_MODEL
    else process.env.MINIMAX_VIDEO_MODEL = previous.model
    if (previous.resolution === undefined) delete process.env.MINIMAX_VIDEO_RESOLUTION
    else process.env.MINIMAX_VIDEO_RESOLUTION = previous.resolution
  }
})
