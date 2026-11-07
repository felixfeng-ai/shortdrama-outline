import type {
  MiniMaxVideoResolution,
  PublicVideoCapabilities,
  PublicVideoModelCapability,
} from "./model.ts"

export interface VideoSelection {
  model: string
  resolution: string
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
