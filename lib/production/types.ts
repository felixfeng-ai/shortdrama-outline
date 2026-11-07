// 短剧生产操作系统的共享类型。
// 这些类型同时服务 API、数据库映射和前端展示，避免三处各写一份枚举。

export const PROJECT_TYPES = ["quick_video", "drama", "marketing"] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

export const PRODUCTION_MODES = ["sample", "batch", "season"] as const
export type ProductionMode = (typeof PRODUCTION_MODES)[number]

export const PRODUCTION_STAGE_KEYS = [
  "source",
  "characters",
  "outline",
  "episodes",
  "visuals",
  "scenes",
  "shots",
  "delivery",
] as const
export type ProductionStageKey = (typeof PRODUCTION_STAGE_KEYS)[number]

export function isProjectType(value: unknown): value is ProjectType {
  return value === "quick_video" || value === "drama" || value === "marketing"
}

export function isProductionStageKey(value: unknown): value is ProductionStageKey {
  return typeof value === "string"
    && PRODUCTION_STAGE_KEYS.includes(value as ProductionStageKey)
}

export type ProductionStageStatus =
  | "draft"
  | "planning"
  | "generating"
  | "ready_for_review"
  | "blocked"
  | "approved"
  | "completed"

export type ProductionPlanStatus =
  | "draft"
  | "active"
  | "blocked"
  | "completed"

export interface ProductionStage {
  key: ProductionStageKey
  position: number
  label: string
  description: string
  status: ProductionStageStatus
}

export interface ProductionPlanSeed {
  projectType: ProjectType
  mode: ProductionMode
  targetEpisodes: number
  currentStage: ProductionStageKey
  status: ProductionPlanStatus
  stages: ProductionStage[]
}

export interface ProductionReadinessInput {
  mode: ProductionMode
  targetEpisodes: number
  episodeCount: number
  missingAssetCount: number
  blockedTaskCount: number
  openGateCount: number
}

export interface ProductionBlocker {
  code:
    | "episodes_incomplete"
    | "missing_assets"
    | "blocked_tasks"
    | "open_gates"
  message: string
  count: number
}

export interface ProductionReadiness {
  ready: boolean
  blockers: ProductionBlocker[]
  summary: string
}
