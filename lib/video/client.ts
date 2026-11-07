import { patchJson, postJson } from "../api.ts"
import type { GeneratedAsset, GenerationBatch, GenerationTask } from "../generation/types.ts"
import type { PublicVideoCapabilities } from "./model.ts"

export interface VideoGenerationState {
  tasks: GenerationTask[]
  assets: GeneratedAsset[]
  batches: GenerationBatch[]
}

export interface VideoGenerationResult {
  task: GenerationTask
  asset: GeneratedAsset | null
  reused?: boolean
}

export interface VideoBatchResult {
  batch: GenerationBatch | null
  tasks: GenerationTask[]
  blocked: Array<{ targetId: string; reason: string }>
  failures: Array<{ targetId: string; reason: string }>
}

/** Web 视频能力入口；客户端不能用环境变量或组件常量自行推断可用模型。 */
export async function fetchVideoCapabilities(): Promise<PublicVideoCapabilities> {
  const response = await fetch("/api/video/capabilities", { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "视频能力读取失败")
  }
  return payload.data as PublicVideoCapabilities
}

export function generateShotVideo(input: {
  projectId: string
  targetId: string
  sourceAssetId?: string | null
  prompt: string
  mode?: "image-to-video" | "text-to-video"
  model?: string
  resolution?: string
  duration: number
  ratio: string
  maxBudgetMicros?: number
  autoSelect?: boolean
  idempotencyKey?: string
}, signal?: AbortSignal): Promise<VideoGenerationResult> {
  return postJson<VideoGenerationResult>("/api/video/generations", input, signal)
}

export async function fetchShotVideoState(
  projectId: string,
  targetId: string,
): Promise<VideoGenerationState> {
  const params = new URLSearchParams({ projectId, targetId })
  return readVideoState(`/api/video/generations?${params.toString()}`)
}

export async function fetchProjectVideoState(
  projectId: string,
): Promise<VideoGenerationState> {
  const params = new URLSearchParams({ projectId })
  return readVideoState(`/api/video/generations?${params.toString()}`)
}

export function generateShotVideoBatch(input: {
  projectId: string
  shots: Array<{
    targetId: string
    sourceAssetId: string
    prompt: string
    duration: number
    ratio: string
  }>
  model?: string
  resolution?: string
  budgetLimitMicros: number
  idempotencyKey: string
}, signal?: AbortSignal): Promise<VideoBatchResult> {
  return postJson<VideoBatchResult>("/api/video/generations/batch", input, signal)
}

async function readVideoState(url: string): Promise<VideoGenerationState> {
  const response = await fetch(url)
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "视频任务读取失败")
  }
  return payload.data as VideoGenerationState
}

export async function selectVideo(projectId: string, assetId: string): Promise<GeneratedAsset> {
  const result = await patchJson<{ asset: GeneratedAsset }>("/api/video/generations", {
    projectId,
    assetId,
    action: "select",
  })
  return result.asset
}

export async function cancelVideoTask(
  projectId: string,
  taskId: string,
): Promise<GenerationTask> {
  const result = await patchJson<{ task: GenerationTask }>("/api/video/generations", {
    projectId,
    taskId,
    action: "cancel",
  })
  return result.task
}

export async function retryVideoTask(
  projectId: string,
  taskId: string,
): Promise<{ task: GenerationTask; reused?: boolean }> {
  return patchJson<{ task: GenerationTask; reused?: boolean }>("/api/video/generations", {
    projectId,
    taskId,
    action: "retry",
  })
}
