// 三种生产模式的范围和目标集数都只在这里定义。
// UI、API 和 Agent 若各自硬编码范围，后续调整档位时一定会漂移。
import type { ProductionMode } from "./types.ts"

export interface ProductionModePreset {
  mode: ProductionMode
  label: string
  eyebrow: string
  description: string
  range: readonly [number, number]
  defaultEpisodes: number
}

export const PRODUCTION_MODE_PRESETS: Record<ProductionMode, ProductionModePreset> = {
  sample: {
    mode: "sample",
    label: "样片验证",
    eyebrow: "先验证",
    description: "用 1-3 集确认人物、钩子、视觉和成本，再决定是否继续。",
    range: [1, 3],
    defaultEpisodes: 3,
  },
  batch: {
    mode: "batch",
    label: "小批生产",
    eyebrow: "验证追更",
    description: "生产 6-20 集，检查连续人物、场景复用和批量成本。",
    range: [6, 20],
    defaultEpisodes: 10,
  },
  season: {
    mode: "season",
    label: "整季生产",
    eyebrow: "完整交付",
    description: "完成 30-120 集，统一管理镜头、视频、声音与交付。",
    range: [30, 120],
    defaultEpisodes: 30,
  },
}

export function isProductionMode(value: unknown): value is ProductionMode {
  return value === "sample" || value === "batch" || value === "season"
}

export function normalizeProductionTarget(mode: ProductionMode, value: unknown): number {
  const preset = PRODUCTION_MODE_PRESETS[mode]
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return preset.defaultEpisodes
  return Math.min(preset.range[1], Math.max(preset.range[0], Math.round(numeric)))
}

/** 旧项目没有生产模式时，用其真实集数推断一个可解释的起点。 */
export function productionModeForEpisodeCount(value: unknown): ProductionMode {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 3) return "sample"
  if (numeric <= 20) return "batch"
  return "season"
}

export interface ProductionPlanSuggestion {
  mode: ProductionMode
  targetEpisodes: number
  label: string
}

/**
 * 已有项目没有生产计划时，用现有集数推断一个安全的确认建议。
 * 零集但已有其他内容时按 3 集样片处理，避免出现无模式却目标 30 的矛盾。
 */
export function buildProductionPlanSuggestion(value: unknown): ProductionPlanSuggestion {
  const numeric = typeof value === "number" ? value : Number(value)
  const episodeCount = Number.isFinite(numeric) && numeric > 0
    ? Math.round(numeric)
    : PRODUCTION_MODE_PRESETS.sample.defaultEpisodes
  const mode = productionModeForEpisodeCount(episodeCount)
  return {
    mode,
    targetEpisodes: normalizeProductionTarget(mode, episodeCount),
    label: PRODUCTION_MODE_PRESETS[mode].label,
  }
}
