// 镜头成本预估（最小版）。
//
// 做什么：在「分镜 → 视频生成」之间加一层成本感知——每个镜头按
// 时长 × 档位单价 × 期望重试次数（由可用率模型推出）+ 参考图超量费，
// 估算出这一镜实际要花多少钱。用户还没点即梦的生成按钮，就能先看到
// 「这镜预计 ¥X、可用率 Y%、是整部剧第几烧钱」。
//
// 为什么值得做：改分镜是免费的，成片重跑是全价的。全行业成本的大头
// （模型费的 92-97%）在视频生成，而最大的隐藏成本是抽卡废片——首次
// 可用率只有 50-70%。成本感知层就是要把「抽卡之前的那一刀」砍下去。
//
// 口径与来源（2026-09 行业牌价，均可通过 config 覆盖）：
//   - Seedance 2.0 API：720P ≈ ¥0.95-1.0/秒，1080P/2K ≈ ¥2.24/秒
//     （SinCoSphere《AI 短剧一分钟多少钱》2026-09，新浪财经转引 API 易）
//   - 参考图：MiniMax H3 前 5 张免费，第 6 张起 $0.04/张 ≈ ¥0.29/张
//   - 首次可用率：行业实测 50-70%，本模型以 70% 为基数
//
// 本文件是纯函数、零依赖，与 lib/assets 其他模块同风格；不接 UI、
// 不持久化，先让算法可测、可演。

import type { Shot } from "./types.ts"

/** 成本档位。分辨率是成本的第一杠杆：720P 与 1080P 单价差 2.24 倍 */
export type CostTier = "720p" | "1080p"

/** 成本估算的可调参数。全部带默认值，来自上面的行业口径；按需覆盖 */
export interface CostConfig {
  /** 当前按哪个档位估。默认 1080p（定稿口径），草片阶段可切 720p 对比 */
  tier: CostTier
  /** 720P 视频单价（元/秒） */
  pricePerSecond720p: number
  /** 1080P 视频单价（元/秒） */
  pricePerSecond1080p: number
  /** 每镜参考图免费张数（超出开始计费） */
  freeRefImages: number
  /** 超出免费张数的参考图单价（元/张） */
  refImagePriceYuan: number
}

export const DEFAULT_COST_CONFIG: CostConfig = {
  tier: "1080p",
  pricePerSecond720p: 1.0,
  pricePerSecond1080p: 2.24,
  freeRefImages: 5,
  refImagePriceYuan: 0.3,
}

/**
 * 高危动作词表：命中说明这一镜有「大幅动作」，是抽卡失败率最高的一类。
 * 词表是启发式的，最小版先按常见词收录；要调精度就改这里，不需要动算法。
 */
export const ACTION_RISK_WORDS = [
  "跑", "奔", "追", "打", "格斗", "搏斗", "挥拳", "踢", "摔", "撞",
  "跳", "翻滚", "坠落", "爆炸", "炸", "飞", "爬", "冲", "劈", "刺",
  "开枪", "射击", "闪避",
] as const

/**
 * 这一镜的动作是否属于高危（大幅动作）。
 * action 是模型写的中文动作描述，命中词表即判高危——宁可多标，不可漏标。
 */
export function hasRiskyAction(action: string): boolean {
  if (!action) return false
  return ACTION_RISK_WORDS.some((w) => action.includes(w))
}

/**
 * 可用率模型：这一镜「一次生成就能用」的概率。
 *
 * 基数 70%（行业实测首次可用率 50-70%，取上限作为单人简单镜的基线），
 * 然后按四类风险逐步下调：
 *   - 角色数：每多一个同框角色 -8%（多人同框是串脸/构图失败主因）
 *   - 大幅动作：×0.75（动作类镜头是重抽的重灾区）
 *   - 复杂运镜（摇/移/跟随）：×0.90（固定/推/拉最稳）
 *   - 缺参考图：×0.85（没有角色锚定图，一致性失败必重抽）
 *
 * 结果夹在 [0.30, 0.85]：不会算成「必成」，也不会算成「永远不成」。
 */
export function shotUsability(shot: Shot, config: CostConfig = DEFAULT_COST_CONFIG): number {
  let u = 0.70
  u -= 0.08 * Math.max(0, shot.characters.length - 1)
  if (hasRiskyAction(shot.action)) u *= 0.75
  if (shot.camera === "摇" || shot.camera === "移" || shot.camera === "跟随") u *= 0.90
  if (shot.missingRefFor.length > 0) u *= 0.85
  return Math.min(0.85, Math.max(0.30, u))
}

/** 单镜成本估算结果 */
export interface ShotCostRow {
  shot: number
  episode: number
  duration: number        // 秒
  characters: number      // 同框角色数
  actionRisk: boolean     // 是否命中高危动作词
  missingRef: boolean     // 是否缺参考图
  usability: number       // 可用率
  retries: number         // 期望重试次数 = 1 / usability
  unitPrice: number       // 当前档位单价（元/秒）
  baseCost: number        // 时长 × 单价（元，一次生成的牌价）
  refCost: number         // 参考图超量费（元，单次）
  expectedCost: number    // 期望总成本（含重试与参考图，元）
  highRisk: boolean       // 是否标为高危（可用率 < 50%）
  suggestions: string[]   // 给这一镜的降本建议
}

/** 整部剧（或一批镜头）的预算汇总 */
export interface BudgetReport {
  tier: CostTier
  tierPrice: number
  totalSeconds: number
  totalExpectedCost: number       // 全部镜头的期望成本合计（含重试）
  totalRefCost: number            // 参考图超量费合计
  rows: ShotCostRow[]
  byEpisode: { episode: number; cost: number; shots: number }[]
  highRiskShots: ShotCostRow[]
  tips: string[]                  // 全剧级降本建议
}

/** 单镜期望成本：时长 × 单价 × 重试次数 + 参考图超量费 × 重试次数 */
export function estimateShotCost(shot: Shot, config: CostConfig = DEFAULT_COST_CONFIG): ShotCostRow {
  const unitPrice = config.tier === "1080p" ? config.pricePerSecond1080p : config.pricePerSecond720p
  const duration = shot.params.duration > 0 ? shot.params.duration : 10
  const usability = shotUsability(shot, config)
  const retries = 1 / usability
  const baseCost = duration * unitPrice
  const refCost = Math.max(0, shot.refImages.length - config.freeRefImages) * config.refImagePriceYuan
  const expectedCost = (baseCost + refCost) * retries
  const actionRisk = hasRiskyAction(shot.action)

  const suggestions: string[] = []
  if (actionRisk) suggestions.push("大幅动作：考虑拆成两个镜头，或先 720P 试草片")
  if (shot.characters.length >= 3) suggestions.push("多人同框：可用率随人数下降，优先拆镜")
  if (shot.missingRefFor.length > 0) suggestions.push("缺参考图：补上角色锚定图再生成，否则大概率串脸重抽")
  if (refCost > 0) suggestions.push(`参考图 ${shot.refImages.length} 张超出免费 ${config.freeRefImages} 张，压到免费张数内`)

  return {
    shot: shot.shot,
    episode: shot.episode,
    duration,
    characters: shot.characters.length,
    actionRisk,
    missingRef: shot.missingRefFor.length > 0,
    usability: round2(usability),
    retries: round2(retries),
    unitPrice,
    baseCost: round2(baseCost),
    refCost: round2(refCost),
    expectedCost: round2(expectedCost),
    highRisk: usability < 0.5,
    suggestions,
  }
}

/** 整批镜头出预算报告：汇总 + 分集 + 高危清单 + 全剧建议 */
export function estimateBudget(shots: Shot[], config: CostConfig = DEFAULT_COST_CONFIG): BudgetReport {
  const rows = shots.map((s) => estimateShotCost(s, config))
  const totalSeconds = rows.reduce((sum, r) => sum + r.duration, 0)
  const totalExpectedCost = round2(rows.reduce((sum, r) => sum + r.expectedCost, 0))
  const totalRefCost = round2(rows.reduce((sum, r) => sum + r.refCost * r.retries, 0))
  const highRiskShots = rows.filter((r) => r.highRisk)

  // 分集小计。episode 为 0 的镜头归入「未标集」行（不假装是第 1 集）
  const byEpisodeMap = new Map<number, { cost: number; shots: number }>()
  for (const r of rows) {
    const key = r.episode
    const cur = byEpisodeMap.get(key) ?? { cost: 0, shots: 0 }
    cur.cost += r.expectedCost
    cur.shots += 1
    byEpisodeMap.set(key, cur)
  }
  const byEpisode = [...byEpisodeMap.entries()]
    .map(([episode, v]) => ({ episode, cost: round2(v.cost), shots: v.shots }))
    .sort((a, b) => a.episode - b.episode)

  const unitPrice = config.tier === "1080p" ? config.pricePerSecond1080p : config.pricePerSecond720p

  const tips: string[] = []
  if (highRiskShots.length > 0) {
    tips.push(`有 ${highRiskShots.length} 个高危镜头（可用率 <50%），烧钱主力：${highRiskShots.map((r) => `#${r.shot}`).join("、")}。先审分镜再生成——改分镜免费，重跑成片全价。`)
  }
  if (totalRefCost > 0) {
    tips.push(`参考图超量费约 ¥${totalRefCost.toFixed(1)}：把每镜参考图压到免费 ${config.freeRefImages} 张内可省下（只带真正在画面里的角色）。`)
  }
  if (config.tier === "1080p") {
    tips.push(`当前按 1080P 定稿口径估（¥${config.pricePerSecond1080p}/秒）。草片阶段切 720P（¥${config.pricePerSecond720p}/秒），重生成阶段约省 55%——七成的重抽发生在草片阶段，定稿再升档。`)
  }
  tips.push("段往 10 秒顶：同样时长下，10 秒一段比 5 秒两段的调用次数少一半，省的是失败次数和每段的起手浪费。")

  return {
    tier: config.tier,
    tierPrice: unitPrice,
    totalSeconds,
    totalExpectedCost,
    totalRefCost,
    rows,
    byEpisode,
    highRiskShots,
    tips,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
