import { patchJson, postJson } from "../api.ts"
import type { ImageAspect } from "./model.ts"
import type { LookBook } from "../look.ts"
import type { GeneratedAsset, GenerationTask, GenerationTargetType } from "./types.ts"

export async function generateKeyframe(input: {
  projectId: string
  targetType: GenerationTargetType
  targetId: string
  prompt: string
  aspect: ImageAspect
  look?: LookBook
}): Promise<{ task: GenerationTask; asset: GeneratedAsset }> {
  return postJson("/api/generations", input)
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
