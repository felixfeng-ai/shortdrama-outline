import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { QUICK_TRIAL_VISUAL_UNITS } from "../lib/production/quick-trial.ts"

test("QV1 视觉试片费用等于定妆、场次、分镜和一张首帧", () => {
  assert.equal(QUICK_TRIAL_VISUAL_UNITS, 10)
})

test("QV2 首帧范围到第 1 镜停止，视频范围同时提供镜头视频步骤", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const gate = fs.readFileSync("components/QuickTrialVisualGate.tsx", "utf8")
  const progress = fs.readFileSync("components/QuickTrialProgress.tsx", "utf8")

  assert.match(page, /generateVisuals/)
  assert.match(page, /generateScenes/)
  assert.match(page, /generateKeyframe/)
  assert.match(page, /QUICK_TRIAL_VISUAL_UNITS/)
  assert.match(page, /autoSelect:\s*true/)
  assert.match(page, /setQuickTrial\(\{\s*phase:\s*["']visual-ready["']/)
  assert.match(gate, /不生成镜头视频/)
  assert.match(gate, /QUICK_TRIAL_VISUAL_UNITS/)
  assert.match(progress, /追加首帧/)
  assert.match(progress, /查看首帧/)
  assert.match(progress, /查看视频/)
  assert.match(progress, /没有继续生成视频/)
})
