/**
 * 模型调用价格表。这里不依赖 Node 或数据库，服务端扣费和前端预估共用同一份。
 * 单位不是货币，只用于平台内部额度与运营成本控制。
 */
export const QUOTA_PRICING_VERSION = "2026-11-v1"
/** 1 个额度单位约对应 0.10 元上游成本，仅用于统一换算，不等同现金。 */
export const QUOTA_UNIT_MICROS = 100_000
export const IMAGE_GENERATION_UNITS = 2
export const IMAGE_EDIT_UNITS = 4
export const RENDER_UNITS = 8

export const STEP_COST: Record<string, number> = {
  ideas: 1,
  assetMatch: 1,
  assistant: 1,
  agent: 1,
  characters: 1,
  acts: 1,
  episodes: 3,
  visual: 2,
  scenes: 2,
  shots: 4,
  novel: 3,
}

export type PricedStep =
  | "ideas" | "assetMatch" | "assistant" | "agent"
  | "characters" | "acts" | "episodes"
  | "visual" | "scenes" | "shots" | "novel"

/** 10 集基准项目成本。60 集等更长项目必须使用 projectQuotaUnits(count)。 */
export const TEN_EPISODE_PROJECT_COST = [
  "characters", "acts", "episodes", "visual", "scenes", "shots",
].reduce((sum, step) => sum + STEP_COST[step as PricedStep], 0)

/**
 * 兼容旧调用。新代码不要再用它表达任意集数的“完整项目”；
 * 页面与 API 应优先调用 lib/episodes.ts 的 projectQuotaUnits(count)。
 */
export const FULL_PROJECT_COST = TEN_EPISODE_PROJECT_COST

/** 未知或新增辅助步骤按最低 1 单位处理，保持既有 chargeQuota 的保守口径。 */
export function stepUnits(step: string): number {
  return Math.max(1, Math.floor(STEP_COST[step as PricedStep] ?? 1))
}

/** 按上游人民币成本向上取整；任何真实调用至少 1 单位。 */
export function quotaUnitsForCostMicros(costMicros: number): number {
  const cost = Math.max(0, Math.ceil(Number(costMicros) || 0))
  return Math.max(1, Math.ceil(cost / QUOTA_UNIT_MICROS))
}
