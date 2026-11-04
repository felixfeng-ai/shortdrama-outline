/**
 * 模型调用价格表。这里不依赖 Node 或数据库，服务端扣费和前端预估共用同一份。
 * 单位不是货币，只用于平台内部额度与运营成本控制。
 */
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
}

export type PricedStep =
  | "ideas" | "assetMatch" | "assistant" | "agent"
  | "characters" | "acts" | "episodes"
  | "visual" | "scenes" | "shots"

/** 一个完整项目的基础口径：分集只按第一批 10 集计算。 */
export const FULL_PROJECT_COST = [
  "characters", "acts", "episodes", "visual", "scenes", "shots",
].reduce((sum, step) => sum + STEP_COST[step as PricedStep], 0)

/** 未知或新增辅助步骤按最低 1 单位处理，保持既有 chargeQuota 的保守口径。 */
export function stepUnits(step: string): number {
  return Math.max(1, Math.floor(STEP_COST[step as PricedStep] ?? 1))
}
