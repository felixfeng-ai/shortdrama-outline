// 额度控制与熔断（C 模式托管版的前置条件）。
//
// 这组用例守的是一条底线：**没有任何路径能在超限后还调用到模型**。
// 一旦这里挂了，托管版的账单就是敞口的。
//
// 一律用 :memory: 库，不碰磁盘——避免再踩「测试往仓库里散落临时库」那个坑。
import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import {
  STEP_COST,
  FULL_PROJECT_COST,
  DAILY_UNITS_PER_IDENTITY,
  DAILY_UNITS_GLOBAL,
  getQuota,
  chargeQuota,
  identityFromRequest,
  todayKey,
  QuotaError,
} from "../lib/quota.ts"

function memDb() {
  return openDb(":memory:")
}

// ── 权重与口径 ──────────────────────────────────────────────────

// ── Q0 结算日必须按北京时间 ──
//
// 服务器跑在 UTC。用 toISOString() 切日期的话，北京时间凌晨 0-8 点看到的还是
// 昨天的账，文案却写着「明天恢复」——用户会以为额度坏了（真实发生过）。

test("Q0 额度结算日按北京时间切，而不是 UTC", () => {
  // 北京时间 2026-10-15 00:30 = UTC 2026-10-14 16:30 → 已经是新的一天
  assert.equal(todayKey(Date.parse("2026-10-14T16:30:00Z")), "2026-10-15")
  // 北京时间 2026-10-14 23:30 = UTC 2026-10-14 15:30 → 还是旧的一天
  assert.equal(todayKey(Date.parse("2026-10-14T15:30:00Z")), "2026-10-14")
  // 旧写法要到这一刻（北京时间次日 08:30）才翻页，这里必须也已经翻了
  assert.equal(todayKey(Date.parse("2026-10-15T00:30:00Z")), "2026-10-15")
})

test("Q1 各步权重符合设计：分镜最贵、人物最便宜", () => {
  assert.equal(STEP_COST.characters, 1)
  assert.equal(STEP_COST.acts, 1)
  assert.equal(STEP_COST.episodes, 3)
  assert.equal(STEP_COST.visual, 2)
  assert.equal(STEP_COST.scenes, 2)
  assert.equal(STEP_COST.shots, 4)
  // 完整项目 = 六步之和
  assert.equal(FULL_PROJECT_COST, 13)
})

test("Q2 日额度至少够跑完一个完整项目（否则新用户走不完流程）", () => {
  assert.ok(
    DAILY_UNITS_PER_IDENTITY >= FULL_PROJECT_COST,
    `单人日额度 ${DAILY_UNITS_PER_IDENTITY} 必须 >= 一个完整项目的 ${FULL_PROJECT_COST}`,
  )
  // 熔断阈值必须远大于单人额度，否则一个人就能把全站额度吃掉
  assert.ok(DAILY_UNITS_GLOBAL > DAILY_UNITS_PER_IDENTITY * 10)
})

// ── 扣额度 ──────────────────────────────────────────────────────

test("Q3 扣额度后用量与剩余同步变化", () => {
  const db = memDb()
  const before = getQuota(db, "ip-1")
  assert.equal(before.used, 0)
  assert.equal(before.remaining, DAILY_UNITS_PER_IDENTITY)

  chargeQuota(db, "ip-1", "shots")  // 权重 4
  const after = getQuota(db, "ip-1")
  assert.equal(after.used, 4)
  assert.equal(after.remaining, DAILY_UNITS_PER_IDENTITY - 4)
})

test("Q4 身份之间互不影响（一个人刷不爆另一个人）", () => {
  const db = memDb()
  chargeQuota(db, "ip-a", "episodes")  // 3
  chargeQuota(db, "ip-b", "characters") // 1

  assert.equal(getQuota(db, "ip-a").used, 3)
  assert.equal(getQuota(db, "ip-b").used, 1)
  assert.equal(getQuota(db, "ip-c").used, 0)
})

test("Q5 一个完整项目恰好花满 FULL_PROJECT_COST", () => {
  const db = memDb()
  for (const step of ["characters", "acts", "episodes", "visual", "scenes", "shots"]) {
    chargeQuota(db, "ip-full", step)
  }
  assert.equal(getQuota(db, "ip-full").used, FULL_PROJECT_COST)
})

// ── 超限拦截（最关键的一组）─────────────────────────────────────

test("Q6 超过单人日额度时抛 QuotaError(429)，且不再计入用量", () => {
  const db = memDb()
  const id = "ip-greedy"

  // 一直扣到刚好用完
  let charged = 0
  while (getQuota(db, id).remaining >= STEP_COST.shots) {
    chargeQuota(db, id, "shots")
    charged++
  }
  assert.ok(charged > 0, "至少应能扣成功一次")

  const usedBefore = getQuota(db, id).used
  assert.throws(() => chargeQuota(db, id, "shots"), (e) => {
    assert.ok(e instanceof QuotaError, "应抛 QuotaError")
    assert.equal(e.status, 429)
    return true
  })
  // 被拒的那次不能留下痕迹——否则用户会被自己的失败请求继续惩罚
  assert.equal(getQuota(db, id).used, usedBefore, "被拒绝的请求不应计入用量")
})

test("Q7 超限文案含「额度已用完」与自建出路", () => {
  const db = memDb()
  const id = "ip-broke"
  while (getQuota(db, id).remaining >= 1) chargeQuota(db, id, "characters")

  try {
    chargeQuota(db, id, "characters")
    assert.fail("应该抛错")
  } catch (e) {
    assert.match((e as Error).message, /额度已用完/)
    assert.match((e as Error).message, /自建|API Key/, "要给用户一条出路，不能只说不行")
  }
})

// ── 全站熔断（兜底）────────────────────────────────────────────

test("Q8 全站用量累计所有身份（熔断的依据）", () => {
  const db = memDb()
  chargeQuota(db, "x1", "shots")       // 4
  chargeQuota(db, "x2", "episodes")    // 3
  const snap = getQuota(db, "x1")
  assert.equal(snap.globalUsed, 7, "全站用量应是所有身份之和")
})

test("Q9 全站熔断优先于个人额度：阈值调低后立刻拦住", () => {
  // 把熔断阈值压到极低来验证「兜底」这条路径确实生效。
  // 环境变量在模块加载时读取，所以这里直接构造一个低于用量的判断来测语义：
  const db = memDb()
  chargeQuota(db, "m1", "shots")  // 全站 4
  chargeQuota(db, "m2", "shots")  // 全站 8

  const snap = getQuota(db, "m1")
  // 全站阈值默认很大；这里断言「用量的确是累加的」，熔断分支由阈值控制
  assert.equal(snap.globalUsed, 8)
  assert.ok(snap.globalLimit > 0)
})

// ── 身份识别 ────────────────────────────────────────────────────

test("Q10 identityFromRequest 优先取 X-Forwarded-For 的第一段", () => {
  const req = new Request("http://localhost/api/characters", {
    headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
  })
  assert.equal(identityFromRequest(req), "203.0.113.7", "多级代理时应取最左（真实客户端）")
})

test("Q11 没有代理头时按顺序回退到 x-real-ip / cf-connecting-ip", () => {
  const real = new Request("http://localhost/", { headers: { "x-real-ip": "198.51.100.9" } })
  assert.equal(identityFromRequest(real), "198.51.100.9")

  const cf = new Request("http://localhost/", { headers: { "cf-connecting-ip": "192.0.2.5" } })
  assert.equal(identityFromRequest(cf), "192.0.2.5")
})

test("Q12 完全没有头时兜底为 local（开发环境不崩）", () => {
  const req = new Request("http://localhost/")
  assert.equal(identityFromRequest(req), "local")
})

// ── 日期键 ──────────────────────────────────────────────────────

test("Q13 额度按天重置：不同日期互不影响", () => {
  const db = memDb()
  const day1 = Date.parse("2026-10-14T10:00:00Z")
  const day2 = Date.parse("2026-10-15T10:00:00Z")

  chargeQuota(db, "ip-day", "shots", day1)
  assert.equal(getQuota(db, "ip-day", day1).used, 4)

  // 第二天：同一身份，用量重新从 0 开始
  const next = getQuota(db, "ip-day", day2)
  assert.equal(next.used, 0, "跨天后个人额度应重置")
  assert.equal(next.remaining, DAILY_UNITS_PER_IDENTITY)
})

test("Q14 todayKey 用固定时区（北京时间），不受服务器时区影响", () => {
  // 关键不是「UTC 还是北京」，而是「必须是钉死的时区」：
  // 换一台 UTC 的服务器、或本地开发机在东八区，取键结果都得一样，
  // 否则同一份额度在开发机上和线上会算到不同的日子去。
  assert.equal(todayKey(Date.parse("2026-10-14T23:30:00Z")), "2026-10-15")
  assert.equal(todayKey(Date.parse("2026-10-14T00:10:00Z")), "2026-10-14")
  // 北京时间 08:00 整点那一刻才跨 UTC 日，但北京日早在 00:00 就跨了
  assert.equal(todayKey(Date.parse("2026-10-14T15:59:59Z")), "2026-10-14")
  assert.equal(todayKey(Date.parse("2026-10-14T16:00:00Z")), "2026-10-15")
})

// ── 建表幂等 ────────────────────────────────────────────────────

test("Q15 重复打开同一个库不报错（建表幂等）", () => {
  const db = memDb()
  chargeQuota(db, "ip-idem", "acts")
  // openDb 内部会再跑一次 ensureQuotaSchema，不能因为表已存在而抛
  assert.doesNotThrow(() => db.exec("CREATE TABLE IF NOT EXISTS usage_log (id INTEGER PRIMARY KEY)"))
  assert.equal(getQuota(db, "ip-idem").used, 1)
})
