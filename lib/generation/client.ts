import { patchJson, postJson } from "../api.ts"
import type { ImageAspect } from "./model.ts"
import { EMPTY_LOOK, type LookBook } from "../look.ts"
import type {
  GeneratedAsset,
  GenerationBatch,
  GenerationStatus,
  GenerationTask,
  GenerationTargetType,
} from "./types.ts"

export interface ImageGenerationRateLimit {
  group: "image"
  label: string
  scope: "ip" | "identity" | "global"
  limit: number
  used: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
  unlimited: boolean
}

export async function fetchImageGenerationRateLimit(): Promise<ImageGenerationRateLimit> {
  const response = await fetch("/api/generations/rate-limit", { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "图像生成额度读取失败")
  }
  return payload.data as ImageGenerationRateLimit
}

export interface KeyframeGenerationResult {
  task: GenerationTask
  asset: GeneratedAsset
  referenceCount: number | null
}

export interface ImageBatchItem {
  taskId: string
  key: string
  name: string
  targetType: GenerationTargetType
  targetId: string
  status: GenerationStatus
  error: string | null
  attempt: number
  maxAttempts: number
  nextPollAt: number | null
  asset: GeneratedAsset | null
}

export interface ImageBatchState {
  batch: GenerationBatch
  counts: {
    total: number
    queued: number
    running: number
    succeeded: number
    failed: number
    canceled: number
  }
  queuePosition: number
  estimatedSeconds: number
  items: ImageBatchItem[]
}

export function createImageGenerationBatch(input: {
  projectId: string
  targets: Array<{
    key: string
    name: string
    targetType: GenerationTargetType
    targetId: string
    prompt: string
    aspect: ImageAspect
  }>
  look: LookBook
  idempotencyKey: string
  priority?: number
  concurrency?: number
}, signal?: AbortSignal): Promise<ImageBatchState> {
  return postJson<ImageBatchState>("/api/generation-batches/image", input, signal)
}

export function fetchImageGenerationBatch(
  projectId: string,
  batchId: string,
  signal?: AbortSignal,
): Promise<ImageBatchState> {
  const params = new URLSearchParams({ projectId })
  return fetch(`/api/generation-batches/${encodeURIComponent(batchId)}?${params}`, {
    cache: "no-store",
    signal,
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.error || "图像批次读取失败")
      }
      return payload.data as ImageBatchState
    })
}

export function updateImageGenerationBatch(
  projectId: string,
  batchId: string,
  action: "pause" | "resume" | "cancel" | "retry-failed" | "retry-task" | "priority",
  extra: { priority?: number; targetKey?: string } = {},
): Promise<ImageBatchState> {
  return patchJson<ImageBatchState>(`/api/generation-batches/${encodeURIComponent(batchId)}`, {
    projectId,
    action,
    ...extra,
  })
}

function abortError(): Error {
  const error = new Error("已停止等待")
  error.name = "AbortError"
  return error
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

async function waitForImageBatch(
  initialState: ImageBatchState,
  projectId: string,
  batchId: string,
  targetKey: string,
  signal?: AbortSignal,
): Promise<ImageBatchState["items"][number]> {
  let state = initialState
  while (true) {
    const item = state.items.find((candidate) => candidate.key === targetKey)
    if (!item) throw new Error("图像队列没有返回当前任务")
    if (item.status === "succeeded") return item
    if (item.status === "failed") throw new Error(item.error || "图像生成失败，请重试")
    if (item.status === "canceled") throw abortError()
    await wait(1_500, signal)
    state = await fetchImageGenerationBatch(projectId, batchId, signal)
  }
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
  const targetKey = `single:${input.targetType}:${input.targetId}`
  const idempotencyKey = [
    "single-image",
    input.projectId,
    input.targetType,
    input.targetId,
    globalThis.crypto?.randomUUID?.() ?? Date.now().toString(),
  ].join(":")
  const queued = await createImageGenerationBatch({
    projectId: input.projectId,
    targets: [{
      key: targetKey,
      name: input.targetId,
      targetType: input.targetType,
      targetId: input.targetId,
      prompt: input.prompt,
      aspect: input.aspect,
    }],
    look: input.look ?? EMPTY_LOOK,
    idempotencyKey,
    concurrency: 1,
  }, signal)
  const item = await waitForImageBatch(
    queued,
    input.projectId,
    queued.batch.id,
    targetKey,
    signal,
  )
  if (!item.asset) throw new Error("图像任务已完成，但没有返回候选图")

  const asset = input.autoSelect === false
    ? item.asset
    : await selectKeyframe(input.projectId, item.asset.id)
  const generation = await fetchGenerationState(
    input.projectId,
    input.targetType,
    input.targetId,
    signal,
  )
  const task = generation.tasks.find((candidate) => candidate.id === item.taskId)
  if (!task) throw new Error("图像任务已完成，但任务记录暂时不可用")
  return { task, asset, referenceCount: null }
}

export async function fetchGenerationState(
  projectId: string,
  targetType: GenerationTargetType,
  targetId: string,
  signal?: AbortSignal,
): Promise<{ tasks: GenerationTask[]; assets: GeneratedAsset[] }> {
  const params = new URLSearchParams({ projectId, targetType, targetId })
  return readGenerationPayload(`/api/generations?${params.toString()}`, signal)
}

export async function fetchProjectGenerationAssets(
  projectId: string,
): Promise<{ tasks: GenerationTask[]; assets: GeneratedAsset[] }> {
  const params = new URLSearchParams({ projectId })
  return readGenerationPayload(`/api/generations?${params.toString()}`)
}

async function readGenerationPayload(
  url: string,
  signal?: AbortSignal,
): Promise<{ tasks: GenerationTask[]; assets: GeneratedAsset[] }> {
  const res = await fetch(url, { signal })
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
