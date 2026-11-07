import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { FULL_PROJECT_COST, STEP_COST, stepUnits } from "../lib/model-pricing.ts"
import { forecastQuota } from "../lib/quota-forecast.ts"
import { episodeQuotaUnits, projectQuotaUnits } from "../lib/episodes.ts"

test("CG1 模型价格表是六步与辅助动作的唯一口径", () => {
  assert.equal(stepUnits("characters"), 1)
  assert.equal(stepUnits("visual"), 2)
  assert.equal(stepUnits("shots"), 4)
  assert.equal(stepUnits("unknown"), 1)
  assert.equal(FULL_PROJECT_COST, 13)
  assert.equal(
    FULL_PROJECT_COST,
    STEP_COST.characters + STEP_COST.acts + STEP_COST.episodes
      + STEP_COST.visual + STEP_COST.scenes + STEP_COST.shots,
  )
})

test("CG2 分集预算按批次变化，而不是只看一次固定权重", () => {
  assert.equal(episodeQuotaUnits(10), 3)
  assert.equal(projectQuotaUnits(30), 19)
  assert.equal(projectQuotaUnits(60), 28)
})

test("CG3 额度足够时给出本步和剩余额度", () => {
  const quote = forecastQuota(4, 19)
  assert.equal(quote.affordable, true)
  assert.equal(quote.shortBy, 0)
  assert.equal(quote.label, "本步 4 单位 · 剩余 19")
})

test("CG4 创作额度不足时明确差多少并阻止提交", () => {
  const quote = forecastQuota(9, 6)
  assert.equal(quote.affordable, false)
  assert.equal(quote.shortBy, 3)
  assert.match(quote.label, /创作额度不足/)
  assert.match(quote.label, /差 3/)
})

test("CG5 创作额度未知时只报本步，不误判为不足", () => {
  const quote = forecastQuota(2, null)
  assert.equal(quote.affordable, true)
  assert.equal(quote.known, false)
  assert.equal(quote.label, "本步 2 单位 · 创作额度读取中")
})

test("CG6 六步主按钮与双版本入口接入统一成本提示", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const step = fs.readFileSync("components/StepSection.tsx", "utf8")
  assert.ok((page.match(/actionHint=/g) ?? []).length >= 6)
  assert.ok((page.match(/quotaBlocked=/g) ?? []).length >= 6)
  assert.match(page, /forecastQuota\(2, quotaRemaining, quotaUnlimited\)/)
  assert.match(step, /quotaBlocked/)
  assert.match(step, /disabled=\{disabled\}/)
})
