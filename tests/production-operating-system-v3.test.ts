import { test } from "node:test"
import assert from "node:assert/strict"

import {
  PRODUCTION_MODE_PRESETS,
  buildProductionPlanSuggestion,
  normalizeProductionTarget,
} from "../lib/production/presets.ts"
import {
  buildProductionStages,
  createProductionPlanSeed,
} from "../lib/production/planner.ts"
import { planProductionExtension } from "../lib/production/promotion.ts"
import { evaluateProductionReadiness } from "../lib/production/readiness.ts"

test("PROD1 三种生产模式使用各自的真实集数范围", () => {
  assert.deepEqual(PRODUCTION_MODE_PRESETS.sample.range, [1, 3])
  assert.deepEqual(PRODUCTION_MODE_PRESETS.batch.range, [6, 20])
  assert.deepEqual(PRODUCTION_MODE_PRESETS.season.range, [30, 120])

  assert.equal(normalizeProductionTarget("sample", 3), 3)
  assert.equal(normalizeProductionTarget("sample", 8), 3)
  assert.equal(normalizeProductionTarget("batch", 1), 6)
  assert.equal(normalizeProductionTarget("batch", 14), 14)
  assert.equal(normalizeProductionTarget("season", 60), 60)
})

test("PROD2 新生产计划从来源阶段开始，阶段顺序稳定且可解释", () => {
  const plan = createProductionPlanSeed({
    projectType: "drama",
    mode: "sample",
    targetEpisodes: 3,
  })

  assert.equal(plan.projectType, "drama")
  assert.equal(plan.mode, "sample")
  assert.equal(plan.targetEpisodes, 3)
  assert.equal(plan.currentStage, "source")
  assert.deepEqual(
    plan.stages.map((stage) => stage.key),
    ["source", "characters", "outline", "episodes", "visuals", "scenes", "shots", "delivery"],
  )
  assert.equal(plan.stages[0].status, "draft")
  assert.equal(plan.stages[1].status, "blocked")
})

test("PROD3 阶段列表只把当前阶段当成可执行动作", () => {
  const stages = buildProductionStages("episodes")
  assert.equal(stages.filter((stage) => stage.status !== "blocked").length, 1)
  assert.equal(stages.find((stage) => stage.key === "episodes")?.status, "draft")
})

test("PROD4 样片扩成小批只生成缺失集，不覆盖已有 1-3 集", () => {
  const extension = planProductionExtension({
    currentTargetEpisodes: 3,
    nextMode: "batch",
    nextTargetEpisodes: 10,
    existingEpisodeNumbers: [3, 1, 2],
  })

  assert.deepEqual(extension.existingEpisodeNumbers, [1, 2, 3])
  assert.deepEqual(extension.newEpisodeNumbers, [4, 5, 6, 7, 8, 9, 10])
  assert.equal(extension.preservedEpisodeCount, 3)
  assert.equal(extension.nextMode, "batch")
  assert.equal(extension.nextTargetEpisodes, 10)
})

test("PROD5 门禁给出具体阻断原因，不用百分比替代", () => {
  const result = evaluateProductionReadiness({
    mode: "sample",
    targetEpisodes: 3,
    episodeCount: 2,
    missingAssetCount: 4,
    blockedTaskCount: 1,
    openGateCount: 2,
  })

  assert.equal(result.ready, false)
  assert.deepEqual(
    result.blockers.map((item) => item.code),
    ["episodes_incomplete", "missing_assets", "blocked_tasks", "open_gates"],
  )
  assert.match(result.blockers[0].message, /还缺 1 集/)
})

test("PROD6 样片达到目标且无阻断时允许晋级", () => {
  const result = evaluateProductionReadiness({
    mode: "sample",
    targetEpisodes: 3,
    episodeCount: 3,
    missingAssetCount: 0,
    blockedTaskCount: 0,
    openGateCount: 0,
  })

  assert.equal(result.ready, true)
  assert.deepEqual(result.blockers, [])
  assert.match(result.summary, /可以晋级/)
})

test("PROD6b 已有内容可推断生产模式，避免重新显示空配置", () => {
  assert.deepEqual(buildProductionPlanSuggestion(3), {
    mode: "sample",
    targetEpisodes: 3,
    label: "样片验证",
  })
  assert.deepEqual(buildProductionPlanSuggestion(10), {
    mode: "batch",
    targetEpisodes: 10,
    label: "小批生产",
  })
  assert.deepEqual(buildProductionPlanSuggestion(30), {
    mode: "season",
    targetEpisodes: 30,
    label: "整季生产",
  })
})
