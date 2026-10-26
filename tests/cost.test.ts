import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_COST_CONFIG, estimateBudget, estimateShotCost,
  hasRiskyAction, shotUsability,
} from "../lib/assets/cost.ts"
import type { Shot } from "../lib/assets/types.ts"

// 造一个最小镜头：只填成本相关的字段，其余给空
function makeShot(overrides: Partial<Shot>): Shot {
  return {
    id: "s", entityId: "e", shot: 1, episode: 1, scene: "场景",
    characters: [], action: "", speaker: "", dialogue: "", place: "",
    shotSize: "中景", camera: "固定", prompt: "", refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: false },
    status: "todo",
    ...overrides,
  }
}

/** 浮点比较：0.70 - 0.08×3 在 IEEE754 里不是精确的 0.46 */
function close(actual: number, expected: number, message?: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    message ?? `期望 ${expected}，实际 ${actual}`,
  )
}

// ── 可用率模型 ────────────────────────────────────────────────

test("C1 单人·固定镜·无动作：基础可用率 70%，期望重试 1.43", () => {
  const shot = makeShot({})
  assert.equal(shotUsability(shot), 0.70)
  const row = estimateShotCost(shot)
  assert.equal(row.retries, 1.43, "1 / 0.7 = 1.4286 → 保留两位 1.43")
})

test("C2 每多一个同框角色，可用率 -8%", () => {
  const one = makeShot({ characters: ["A"] })
  const two = makeShot({ characters: ["A", "B"] })
  const four = makeShot({ characters: ["A", "B", "C", "D"] })
  assert.equal(shotUsability(two), 0.62)
  close(shotUsability(four), 0.46, "0.70 - 0.08×3 = 0.46")
})

test("C3 高危动作词把可用率再压 25%", () => {
  const calm = makeShot({ action: "举杯" })
  const fight = makeShot({ action: "两人挥拳格斗" })
  assert.equal(shotUsability(calm), 0.70)
  close(shotUsability(fight), 0.525, "0.70 × 0.75")
})

test("C4 复杂运镜（摇/移/跟随）可用率 ×0.90；固定/推/拉不罚", () => {
  assert.equal(shotUsability(makeShot({ camera: "摇" })), 0.63)
  assert.equal(shotUsability(makeShot({ camera: "移" })), 0.63)
  assert.equal(shotUsability(makeShot({ camera: "跟随" })), 0.63)
  assert.equal(shotUsability(makeShot({ camera: "推" })), 0.70)
  assert.equal(shotUsability(makeShot({ camera: "拉" })), 0.70)
})

test("C5 缺参考图可用率 ×0.85：串脸必重抽", () => {
  const shot = makeShot({ missingRefFor: ["女主"] })
  assert.equal(shotUsability(shot), 0.595, "0.70 × 0.85")
})

test("C6 可用率夹在 [0.30, 0.85]，极端输入不炸", () => {
  const worst = makeShot({ characters: ["A", "B", "C", "D", "E", "F"], action: "爆炸", camera: "跟随", missingRefFor: ["A"] })
  const best = makeShot({ characters: ["A"], action: "", camera: "固定", missingRefFor: [] })
  assert.equal(shotUsability(worst), 0.30, "向下夹住")
  assert.equal(shotUsability(best), 0.70, "单人简单镜最多 0.70，不虚高")
})

test("C7 hasRiskyAction 命中常见动作词，空动作与普通词不命中", () => {
  assert.equal(hasRiskyAction("两人追逐打斗"), true)
  assert.equal(hasRiskyAction("汽车爆炸"), true)
  assert.equal(hasRiskyAction(""), false)
  assert.equal(hasRiskyAction("安静地站在窗边"), false)
})

// ── 单镜成本公式 ──────────────────────────────────────────────

test("C8 单镜期望成本 = (时长×单价 + 参考图超量费) × 重试次数", () => {
  // 10 秒 1080P（¥2.24/秒）单人：base = 22.4，retries = 1/0.7 ≈ 1.4286
  const row = estimateShotCost(makeShot({}))
  assert.equal(row.baseCost, 22.4)
  // 22.4 ÷ 0.7 = 32 精确成立；早先按四舍五入后的 1.43 算成 32.03 是错的
  close(row.expectedCost, 32, "22.4 ÷ 0.7 = 32")
})

test("C9 720P 单价约是 1080P 的 44%：档位是第一杠杆", () => {
  const hd = estimateShotCost(makeShot({}), DEFAULT_COST_CONFIG)
  const sd = estimateShotCost(makeShot({}), { ...DEFAULT_COST_CONFIG, tier: "720p" })
  assert.equal(sd.baseCost, 10.0, "720P ¥1.0/秒 × 10 秒")
  assert.ok(hd.baseCost / sd.baseCost > 2.2, "1080P/720P ≥ 2.24 倍")
})

test("C10 参考图超量才计费：6 张收 1 张的钱，5 张以内免费", () => {
  const free = estimateShotCost(makeShot({ refImages: ["A·a", "B·b", "C·c", "D·d", "E·e"] }))
  const over = estimateShotCost(makeShot({ refImages: ["A·a", "B·b", "C·c", "D·d", "E·e", "F·f"] }))
  assert.equal(free.refCost, 0, "5 张以内不收费")
  assert.equal(over.refCost, 0.3, "第 6 张起 ¥0.3/张")
})

test("C11 高危判定：可用率 < 50% 的镜头标 highRisk", () => {
  const risky = makeShot({ characters: ["A", "B", "C"], action: "打斗", camera: "跟随" })
  const safe = makeShot({})
  assert.equal(estimateShotCost(risky).highRisk, true)
  assert.equal(estimateShotCost(safe).highRisk, false)
})

test("C12 时长读 params.duration，异常值兜底为 10 秒", () => {
  assert.equal(estimateShotCost(makeShot({ params: { ratio: "9:16", duration: 5, lastFrame: false } })).duration, 5)
  assert.equal(estimateShotCost(makeShot({ params: { ratio: "9:16", duration: 0, lastFrame: false } })).duration, 10)
})

// ── 整剧预算 ──────────────────────────────────────────────────

test("C13 汇总：总成本 = Σ单镜期望成本，分集小计正确", () => {
  const shots = [
    makeShot({ shot: 1, episode: 1 }),
    makeShot({ shot: 2, episode: 1 }),
    makeShot({ shot: 3, episode: 2, characters: ["A", "B", "C"], action: "打斗" }),
  ]
  const report = estimateBudget(shots)
  const manual = shots.reduce((sum, s) => sum + estimateShotCost(s).expectedCost, 0)
  assert.equal(report.totalExpectedCost, Math.round(manual * 100) / 100)
  assert.equal(report.byEpisode.length, 2)
  const ep1 = report.byEpisode.find((e) => e.episode === 1)!
  assert.equal(ep1.shots, 2)
})

test("C14 空输入：返回空报告，不炸", () => {
  const report = estimateBudget([])
  assert.equal(report.totalExpectedCost, 0)
  assert.equal(report.rows.length, 0)
  assert.equal(report.highRiskShots.length, 0)
})

test("C15 高危镜头进入 highRiskShots 清单，且 tips 会提示", () => {
  const shots = [makeShot({}), makeShot({ shot: 2, characters: ["A", "B", "C", "D"], action: "爆炸", camera: "跟随", missingRefFor: ["A"] })]
  const report = estimateBudget(shots)
  assert.equal(report.highRiskShots.length, 1)
  assert.equal(report.highRiskShots[0].shot, 2)
  assert.ok(report.tips.some((t) => t.includes("高危镜头")))
})

test("C16 参考图超量合计进 totalRefCost，并给出建议", () => {
  const shots = [
    makeShot({ refImages: ["A·a", "B·b", "C·c", "D·d", "E·e", "F·f", "G·g"] }),
  ]
  const report = estimateBudget(shots)
  assert.ok(report.totalRefCost > 0)
  assert.ok(report.tips.some((t) => t.includes("参考图超量费")))
})
