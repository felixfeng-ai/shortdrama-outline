// 非破坏式扩容只计算新增集，不重新生成已有集。
import type { ProductionMode } from "./types.ts"
import { normalizeProductionTarget } from "./presets.ts"

export interface ProductionExtensionPlan {
  currentTargetEpisodes: number
  nextMode: ProductionMode
  nextTargetEpisodes: number
  existingEpisodeNumbers: number[]
  newEpisodeNumbers: number[]
  preservedEpisodeCount: number
}

export function planProductionExtension(input: {
  currentTargetEpisodes: number
  nextMode: ProductionMode
  nextTargetEpisodes?: number
  existingEpisodeNumbers: readonly number[]
}): ProductionExtensionPlan {
  const fallbackTarget = input.nextMode === "batch"
    ? 10
    : input.nextMode === "season"
      ? 30
      : 3
  const nextTargetEpisodes = normalizeProductionTarget(
    input.nextMode,
    input.nextTargetEpisodes ?? fallbackTarget,
  )
  const existingEpisodeNumbers = [...new Set(
    input.existingEpisodeNumbers
      .map((value) => Math.round(value))
      .filter((value) => Number.isFinite(value) && value > 0 && value <= nextTargetEpisodes),
  )].sort((a, b) => a - b)
  const existing = new Set(existingEpisodeNumbers)
  const newEpisodeNumbers = Array.from(
    { length: nextTargetEpisodes },
    (_, index) => index + 1,
  ).filter((number) => !existing.has(number))

  return {
    currentTargetEpisodes: Math.max(0, Math.round(input.currentTargetEpisodes)),
    nextMode: input.nextMode,
    nextTargetEpisodes,
    existingEpisodeNumbers,
    newEpisodeNumbers,
    preservedEpisodeCount: existingEpisodeNumbers.length,
  }
}
