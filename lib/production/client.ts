// 生产计划前端请求封装。所有响应都走现有统一信封。
import { patchJson, postJson } from "@/lib/api"
import type {
  ProductionMode,
  ProductionPlanStatus,
  ProductionStageKey,
  ProductionStageStatus,
  ProjectType,
} from "./types"

export interface ProductionStageDto {
  key: ProductionStageKey
  position: number
  label: string
  description: string
  status: ProductionStageStatus
}

export interface ProductionPlanDto {
  id: string
  projectId: string
  projectType: ProjectType
  mode: ProductionMode
  targetEpisodes: number
  currentStage: ProductionStageKey
  status: ProductionPlanStatus
  createdAt: number
  updatedAt: number
  stages: ProductionStageDto[]
}

export interface ProductionExtensionDto {
  id: string
  planId: string
  fromMode: ProductionMode
  toMode: ProductionMode
  fromTargetEpisodes: number
  toTargetEpisodes: number
  existingEpisodeNumbers: number[]
  newEpisodeNumbers: number[]
  estimatedUnits: number
  createdAt: number
}

export async function fetchProductionPlan(
  projectId: string,
): Promise<ProductionPlanDto | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/production`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "生产计划读取失败")
  }
  return payload.data.plan as ProductionPlanDto | null
}

export async function createProductionPlan(
  projectId: string,
  input: {
    projectType: ProjectType
    mode: ProductionMode
    targetEpisodes?: number
    currentStage?: ProductionStageKey
  },
): Promise<ProductionPlanDto> {
  return postJson<{ plan: ProductionPlanDto }>(
    `/api/projects/${encodeURIComponent(projectId)}/production`,
    input,
  ).then((data) => data.plan)
}

export async function updateProductionPlan(
  projectId: string,
  input: {
    mode?: ProductionMode
    targetEpisodes?: number
    currentStage?: ProductionStageKey
    status?: ProductionPlanStatus
  },
): Promise<ProductionPlanDto> {
  return patchJson<{ plan: ProductionPlanDto }>(
    `/api/projects/${encodeURIComponent(projectId)}/production`,
    input,
  ).then((data) => data.plan)
}

export async function extendProductionPlan(
  projectId: string,
  input: {
    mode: ProductionMode
    targetEpisodes?: number
    existingEpisodeNumbers: number[]
    estimatedUnits?: number
  },
): Promise<{ plan: ProductionPlanDto; extension: ProductionExtensionDto }> {
  return postJson<{ plan: ProductionPlanDto; extension: ProductionExtensionDto }>(
    `/api/projects/${encodeURIComponent(projectId)}/production/extend`,
    input,
  )
}
