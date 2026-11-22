import type {
  MiniMaxVideoResolution,
  PublicVideoCapabilities,
  PublicVideoModelCapability,
} from "./model.ts"

/**
 * 视频能力的客户端纯函数层。
 * 默认模型、分辨率、价格和时长兼容性都来自服务端能力，禁止在这里复制供应商常量。
 */
export interface VideoSelection {
  model: string
  resolution: string
}

export type VideoQualityGoal = "draft" | "standard" | "final"

export interface VideoRecommendation {
  model: string
  resolution: string
  estimatedCostMicros: number
  goal: VideoQualityGoal
  reason: string
  overBudget: boolean
}

export function findVideoModel(
  capabilities: PublicVideoCapabilities,
  model: string,
): PublicVideoModelCapability | null {
  return capabilities.models.find((item) => item.id === model) ?? null
}

/** 默认跟服务端；用户切换模型时优先保留可用分辨率，否则取第一个。 */
export function resolveVideoSelection(
  capabilities: PublicVideoCapabilities,
  requestedModel?: string,
  requestedResolution?: string,
): VideoSelection {
  // 切换模型时优先保留当前分辨率；不兼容才回落到服务端默认或首个支持项。
  const model = findVideoModel(capabilities, requestedModel ?? capabilities.defaultModel)
    ?? findVideoModel(capabilities, capabilities.defaultModel)
    ?? capabilities.models[0]
  if (!model) {
    return {
      model: capabilities.defaultModel,
      resolution: capabilities.defaultResolution,
    }
  }
  const resolution = model.resolutions.includes(
    requestedResolution as MiniMaxVideoResolution,
  )
    ? requestedResolution!
    : model.resolutions.find((item) => item === capabilities.defaultResolution)
      ?? model.resolutions[0]
      ?? capabilities.defaultResolution
  return { model: model.id, resolution }
}

export function videoPricePerSecond(
  capabilities: PublicVideoCapabilities,
  model: string,
  resolution: string,
): number | null {
  const capability = findVideoModel(capabilities, model)
  const price = capability?.pricesPerSecond[resolution as MiniMaxVideoResolution]
  return typeof price === "number" ? price : null
}

export function estimateVideoSelectionCost(
  capabilities: PublicVideoCapabilities,
  model: string,
  resolution: string,
  duration: number,
): number | null {
  if (!supportsVideoDuration(capabilities, model, duration)) return null
  const price = videoPricePerSecond(capabilities, model, resolution)
  if (price === null) return null
  return Math.round(price * duration * 1_000_000)
}

export function supportsVideoDuration(
  capabilities: PublicVideoCapabilities,
  model: string,
  duration: number,
): boolean {
  const capability = findVideoModel(capabilities, model)
  if (!capability || !Number.isFinite(duration)) return false
  const seconds = Math.floor(duration)
  return seconds >= capability.minDuration && seconds <= capability.maxDuration
}

function resolutionRank(resolution: string): number {
  if (resolution === "2K") return 3
  if (resolution === "768P") return 2
  if (resolution === "480P") return 1
  return 0
}

function compareRecommendation(
  left: VideoRecommendation,
  right: VideoRecommendation,
): number {
  if (left.goal === "draft") {
    return left.estimatedCostMicros - right.estimatedCostMicros
      || resolutionRank(left.resolution) - resolutionRank(right.resolution)
  }
  if (left.goal === "standard") {
    return Math.abs(resolutionRank(left.resolution) - 2)
      - Math.abs(resolutionRank(right.resolution) - 2)
      || left.estimatedCostMicros - right.estimatedCostMicros
  }
  return resolutionRank(right.resolution) - resolutionRank(left.resolution)
    || left.estimatedCostMicros - right.estimatedCostMicros
}

/**
 * 推荐只基于服务端公开能力做确定性排序，不猜测画面质量。
 * 有预算时先排除超预算组合；全部超预算时明确回落最低成本，不能静默超支。
 */
export function recommendVideoSelection(input: {
  capabilities: PublicVideoCapabilities
  duration: number
  goal: VideoQualityGoal
  budgetLimitMicros?: number
}): VideoRecommendation {
  const candidates: VideoRecommendation[] = []
  for (const model of input.capabilities.models) {
    if (!supportsVideoDuration(input.capabilities, model.id, input.duration)) continue
    for (const resolution of model.resolutions) {
      const estimatedCostMicros = estimateVideoSelectionCost(
        input.capabilities,
        model.id,
        resolution,
        input.duration,
      )
      if (estimatedCostMicros === null) continue
      candidates.push({
        model: model.id,
        resolution,
        estimatedCostMicros,
        goal: input.goal,
        reason: "",
        overBudget: false,
      })
    }
  }
  if (candidates.length === 0) {
    throw new Error(`当前没有模型支持 ${input.duration} 秒镜头`)
  }

  const budget = Number.isFinite(input.budgetLimitMicros)
    ? Math.max(0, Math.floor(input.budgetLimitMicros!))
    : null
  const affordable = budget === null
    ? candidates
    : candidates.filter((candidate) => candidate.estimatedCostMicros <= budget)
  const pool = affordable.length > 0 ? affordable : candidates
  const selected = [...pool].sort((left, right) =>
    budget !== null && affordable.length === 0
      ? left.estimatedCostMicros - right.estimatedCostMicros
        || resolutionRank(left.resolution) - resolutionRank(right.resolution)
      : compareRecommendation(left, right)
  )[0]!
  const overBudget = budget !== null && selected.estimatedCostMicros > budget
  const cost = `预计 ¥${(selected.estimatedCostMicros / 1_000_000).toFixed(2)}`
  const baseReason = input.goal === "draft"
    ? `试片优先成本，选择当前最低价组合，${cost}。`
    : input.goal === "standard"
      ? `标准档优先 768P，并在兼容组合中选择成本更低方案，${cost}。`
      : `成片档优先最高可用分辨率，${cost}。`
  return {
    ...selected,
    goal: input.goal,
    reason: overBudget
      ? `${baseReason} 当前预算不足以覆盖任何可用组合，最低仍需 ¥${(selected.estimatedCostMicros / 1_000_000).toFixed(2)}。`
      : budget !== null
        ? `${baseReason} 已限制在 ¥${(budget / 1_000_000).toFixed(2)} 预算内。`
        : baseReason,
    overBudget,
  }
}
