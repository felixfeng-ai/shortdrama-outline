import test from "node:test"
import assert from "node:assert/strict"

import {
  projectQuotaEstimate,
  projectQuotaEstimates,
} from "../lib/episodes.ts"
import {
  FULL_PROJECT_COST,
  TEN_EPISODE_PROJECT_COST,
  QUOTA_PRICING_VERSION,
  IMAGE_EDIT_UNITS,
  IMAGE_GENERATION_UNITS,
  RENDER_UNITS,
  quotaUnitsForCostMicros,
} from "../lib/model-pricing.ts"
import { GET as getQuotaRoute } from "../app/api/quota/route.ts"
import { __resetDbForTests } from "../lib/assets/store.ts"

test("QV2-1 65 单位按当前集数换算项目数", () => {
  assert.deepEqual(projectQuotaEstimate(65, 10), {
    episodeCount: 10,
    units: 13,
    projectsLeft: 5,
  })
  assert.deepEqual(projectQuotaEstimate(65, 30), {
    episodeCount: 30,
    units: 19,
    projectsLeft: 3,
  })
  assert.deepEqual(projectQuotaEstimate(65, 60), {
    episodeCount: 60,
    units: 28,
    projectsLeft: 2,
  })
})

test("QV2-1b 统一返回值同时提供当前集数与三档预设", () => {
  const estimates = projectQuotaEstimates(38, 30)
  assert.deepEqual(estimates.selected, {
    episodeCount: 30,
    units: 19,
    projectsLeft: 2,
  })
  assert.deepEqual(
    estimates.presets.map((item) => [item.episodeCount, item.units, item.projectsLeft]),
    [[10, 13, 2], [30, 19, 2], [60, 28, 1]],
  )
})

test("QV2-1c 13 只表示 10 集基准，价格表带版本号", () => {
  assert.equal(TEN_EPISODE_PROJECT_COST, 13)
  assert.equal(FULL_PROJECT_COST, TEN_EPISODE_PROJECT_COST)
  assert.match(QUOTA_PRICING_VERSION, /^\d{4}-\d{2}-v\d+$/)
})

test("QV2-1e 图片、视频和渲染共用一套成本换算", () => {
  assert.equal(IMAGE_GENERATION_UNITS, 2)
  assert.equal(IMAGE_EDIT_UNITS, 4)
  assert.equal(RENDER_UNITS, 8)
  assert.equal(quotaUnitsForCostMicros(250_000), 3)
  assert.equal(quotaUnitsForCostMicros(1), 1)
})

test("QV2-1d 额度接口按 episodeCount 返回统一估算", async () => {
  __resetDbForTests(":memory:")
  const response = await getQuotaRoute(new Request("http://localhost/api/quota?episodeCount=30"))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.episodeCount, 30)
  assert.deepEqual(payload.data.estimates.selected, {
    episodeCount: 30,
    units: 19,
    projectsLeft: 15,
  })
  assert.equal(payload.data.fullProjectCost, 19)
  assert.equal(payload.data.tenEpisodeProjectCost, 13)
  assert.deepEqual(
    payload.data.estimates.presets.map((item: { episodeCount: number }) => item.episodeCount),
    [10, 30, 60],
  )
  assert.deepEqual(payload.data.mediaCosts, {
    imageGenerate: 2,
    imageEdit: 4,
    render: 8,
    unitMicros: 100_000,
  })
})
