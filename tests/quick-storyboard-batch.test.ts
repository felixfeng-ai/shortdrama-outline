import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  QUICK_TRIAL_STORYBOARD_SHOT_COUNT,
  QUICK_TRIAL_VISUAL_UNITS,
  buildQuickCreationQuotes,
  type QuickCreationVideoPrice,
} from "../lib/production/quick-trial.ts"
import {
  missingStoryboardKeyframes,
  selectStoryboardShots,
} from "../lib/production/quick-storyboard.ts"

const videoPrice: QuickCreationVideoPrice = {
  enabled: true,
  model: "MiniMax-H3-Lite",
  resolution: "480P",
  durationSeconds: 5,
  costMicros: 800_000,
}

test("QSB1 默认快速视觉范围生成五镜动态分镜并统一报价", () => {
  const quotes = buildQuickCreationQuotes(videoPrice)

  assert.equal(QUICK_TRIAL_STORYBOARD_SHOT_COUNT, 5)
  assert.equal(QUICK_TRIAL_VISUAL_UNITS, 18)
  assert.equal(quotes.keyframe.units, 23)
  assert.equal(quotes.keyframe.totalMicros, 2_300_000)
  assert.equal(quotes.video.units, 31)
  assert.match(quotes.keyframe.label, /动态分镜/)
})

test("QSB2 分镜镜头按集号镜号排序并只取前五镜", () => {
  const shots = [
    { id: "e2s1", episode: 2, shot: 1 },
    { id: "e1s3", episode: 1, shot: 3 },
    { id: "e1s1", episode: 1, shot: 1 },
    { id: "e1s5", episode: 1, shot: 5 },
    { id: "e1s4", episode: 1, shot: 4 },
    { id: "e1s2", episode: 1, shot: 2 },
  ] as never[]

  assert.deepEqual(
    selectStoryboardShots(shots).map((shot) => shot.id),
    ["e1s1", "e1s2", "e1s3", "e1s4", "e1s5"],
  )
})

test("QSB3 已采用首帧的镜头跳过，只补缺失镜头", () => {
  const shots = Array.from({ length: 5 }, (_, index) => ({
    id: `shot-${index + 1}`,
    episode: 1,
    shot: index + 1,
  })) as never[]
  const assets = [
    { targetType: "shot", targetId: "shot-1", mediaKind: "image", selectedAt: 1 },
    { targetType: "shot", targetId: "shot-3", mediaKind: "image", selectedAt: 1 },
    { targetType: "shot", targetId: "shot-4", mediaKind: "image", selectedAt: null },
  ] as never[]

  assert.deepEqual(
    missingStoryboardKeyframes(shots, assets).map((shot) => shot.id),
    ["shot-2", "shot-4", "shot-5"],
  )
})

test("QSB4 页面使用单一批次、并发二并立即采用成功首帧", () => {
  const client = fs.readFileSync("lib/generation/client.ts", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const gate = fs.readFileSync("components/QuickTrialVisualGate.tsx", "utf8")
  const onboarding = fs.readFileSync("components/WorkspaceOnboarding.tsx", "utf8")
  const progress = fs.readFileSync("components/QuickTrialProgress.tsx", "utf8")

  assert.match(client, /generateStoryboardKeyframes/)
  assert.match(client, /createImageGenerationBatch/)
  assert.match(client, /concurrency:\s*2/)
  assert.match(client, /selectKeyframe/)
  assert.match(client, /adoptSucceeded/)
  assert.match(page, /generateStoryboardKeyframes/)
  assert.match(page, /missingStoryboardKeyframes/)
  assert.doesNotMatch(page, /const frame = await generateKeyframe/)
  assert.match(gate, /5 张/)
  assert.match(onboarding, /动态分镜/)
  assert.match(progress, /动态分镜/)
})
