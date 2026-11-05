import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { latestSnapshot } from "../assets/repo.ts"
import { readGeneratedImage } from "../generation/files.ts"
import {
  createGenerationTask,
  failGenerationTask,
  getGeneratedAsset,
  markGenerationTaskRunning,
  updateGenerationProviderTask,
} from "../generation/repo.ts"
import type { GenerationTask } from "../generation/types.ts"
import { estimateVideoCostMicros } from "./model.ts"
import { submitMiniMaxVideo } from "./service.ts"

export function findProjectShot(
  db: DatabaseSync,
  projectId: string,
  targetId: string,
): Record<string, unknown> | null {
  const snapshot = latestSnapshot(db, projectId, "shots")
  if (!snapshot || !Array.isArray(snapshot.payload)) return null
  const shot = snapshot.payload.find((item) => {
    if (!item || typeof item !== "object") return false
    const record = item as Record<string, unknown>
    return record.entityId === targetId || record.id === targetId
  })
  return shot && typeof shot === "object" ? shot as Record<string, unknown> : null
}

export function findSelectedFrame(
  db: DatabaseSync,
  projectId: string,
  targetId: string,
  sourceAssetId: string,
  options: { requireSelected?: boolean } = {},
) {
  const asset = getGeneratedAsset(db, sourceAssetId, projectId)
  if (!asset) throw new InputError("首帧不存在或无权访问")
  if (asset.mediaKind !== "image" || asset.targetType !== "shot" || asset.targetId !== targetId) {
    throw new InputError("首帧不属于当前镜头")
  }
  if (options.requireSelected !== false && !asset.selectedAt) {
    throw new InputError("请先采用一张首帧再生成视频")
  }
  return asset
}

export async function createAndSubmitVideoTask(
  db: DatabaseSync,
  input: {
    projectId: string
    targetId: string
    sourceAssetId?: string | null
    prompt: string
    mode: "image-to-video" | "text-to-video"
    model: string
    resolution: string
    duration: number
    ratio: string
    batchId?: string | null
    maxBudgetMicros: number
    idempotencyKey?: string | null
    retryOfTaskId?: string | null
    requireSelectedFrame?: boolean
    autoSelect?: boolean
    signal?: AbortSignal
  },
): Promise<{ task: GenerationTask; reused: boolean }> {
  const prompt = input.prompt.trim()
  if (!prompt) throw new InputError("缺少视频提示词")
  const shot = findProjectShot(db, input.projectId, input.targetId)
  if (!shot) throw new InputError("当前镜头还没有保存到项目")

  const estimatedCostMicros = estimateVideoCostMicros({
    model: input.model,
    resolution: input.resolution,
    duration: input.duration,
  })
  if (input.maxBudgetMicros < estimatedCostMicros) {
    throw new InputError(
      `预计费用 ${(estimatedCostMicros / 1_000_000).toFixed(2)} 元，超过本次预算`,
    )
  }

  let firstFrame: { bytes: Uint8Array; mime: string } | undefined
  if (input.mode === "image-to-video") {
    if (!input.sourceAssetId) throw new InputError("图生视频需要先采用一张首帧")
    const frame = findSelectedFrame(
      db,
      input.projectId,
      input.targetId,
      input.sourceAssetId,
      { requireSelected: input.requireSelectedFrame !== false },
    )
    firstFrame = { bytes: readGeneratedImage(frame.storageKey), mime: frame.mime }
  }

  const task = createGenerationTask(db, {
    projectId: input.projectId,
    targetType: "shot",
    targetId: input.targetId,
    providerId: "minimax",
    model: input.model,
    prompt,
    mediaKind: "video",
    batchId: input.batchId ?? null,
    request: {
      mode: input.mode,
      resolution: input.resolution,
      duration: input.duration,
      ratio: input.ratio,
      sourceAssetId: input.sourceAssetId || null,
      autoSelect: input.autoSelect === true,
    },
    pricingVersion: "minimax-video-2026-11-05",
    estimatedCostMicros,
    maxAttempts: 1,
    idempotencyKey: input.idempotencyKey,
    retryOfTaskId: input.retryOfTaskId ?? null,
    nextPollAt: Date.now(),
  })
  if (task.status !== "queued" || task.providerTaskId) {
    return { task, reused: true }
  }

  try {
    const submitted = await submitMiniMaxVideo({
      prompt,
      model: input.model,
      resolution: input.resolution,
      duration: input.duration,
      ratio: input.ratio,
      firstFrame,
      signal: input.signal,
    })
    updateGenerationProviderTask(db, task.id, {
      providerTaskId: submitted.providerTaskId,
      providerStatus: "queued",
      nextPollAt: Date.now(),
    })
    return { task: markGenerationTaskRunning(db, task.id), reused: false }
  } catch (error) {
    failGenerationTask(db, task.id, error instanceof Error ? error.message : "视频提交失败")
    throw error
  }
}
