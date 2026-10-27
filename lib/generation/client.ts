import { patchJson, postJson } from "../api.ts"
import type { ImageAspect } from "./model.ts"
import type { LookBook } from "../look.ts"
import type { GeneratedAsset, GenerationTask, GenerationTargetType } from "./types.ts"

export interface KeyframeGenerationResult {
  task: GenerationTask
  asset: GeneratedAsset
  referenceCount: number
}

export async function generateKeyframe(input: {
  projectId: string
  targetType: GenerationTargetType
  targetId: string
  prompt: string
  aspect: ImageAspect
  look?: LookBook
  /** 批量任务默认只保存候选，不覆盖当前采用图。 */
  autoSelect?: boolean
}, signal?: AbortSignal): Promise<KeyframeGenerationResult> {
  return postJson<KeyframeGenerationResult>("/api/generations", input, signal)
}

export async function fetchGenerationState(
  projectId: string,
  targetType: GenerationTargetType,
  targetId: string,
): Promise<{ tasks: GenerationTask[]; assets: GeneratedAsset[] }> {
  const params = new URLSearchParams({ projectId, targetType, targetId })
  return readGenerationPayload(`/api/generations?${params.toString()}`)
}

export async function fetchProjectGenerationAssets(
  projectId: string,
): Promise<{ tasks: GenerationTask[]; assets: GeneratedAsset[] }> {
  const params = new URLSearchParams({ projectId })
  return readGenerationPayload(`/api/generations?${params.toString()}`)
}

async function readGenerationPayload(
  url: string,
): Promise<{ tasks: GenerationTask[]; assets: GeneratedAsset[] }> {
  const res = await fetch(url)
  const payload = await res.json().catch(() => null)
  if (!res.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "关键帧读取失败")
  }
  return payload.data as { tasks: GenerationTask[]; assets: GeneratedAsset[] }
}

export async function selectKeyframe(projectId: string, assetId: string): Promise<GeneratedAsset> {
  const result = await patchJson<{ asset: GeneratedAsset }>("/api/generations", { projectId, assetId })
  return result.asset
}
