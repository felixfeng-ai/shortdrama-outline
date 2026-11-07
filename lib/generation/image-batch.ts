import type { DatabaseSync } from "node:sqlite"

import { latestSnapshot } from "../assets/repo.ts"
import { placeGenerationTargetId } from "../assets/anchors.ts"
import { IMAGE_GENERATION_UNITS } from "../model-pricing.ts"
import { getQuota, QuotaError, reserveQuota } from "../quota.ts"
import type { LookBook } from "../look.ts"
import type { ImageAspect } from "./model.ts"
import {
  cancelGenerationTask,
  createGenerationBatch,
  createGenerationTask,
  getGeneratedAsset,
  getGenerationBatch,
  listGenerationTasksByBatch,
  type GeneratedAsset,
  type GenerationBatch,
  type GenerationTargetType,
  type GenerationTask,
  type MediaKind,
} from "./repo.ts"

export interface ImageBatchTargetInput {
  key: string
  name: string
  targetType: GenerationTargetType
  targetId: string
  prompt: string
  aspect: ImageAspect
}

export interface ImageBatchItemDto {
  taskId: string
  key: string
  name: string
  targetType: GenerationTargetType
  targetId: string
  status: GenerationTask["status"]
  error: string | null
  attempt: number
  maxAttempts: number
  nextPollAt: number | null
  asset: GeneratedAsset | null
}

export interface ImageBatchStateDto {
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
  items: ImageBatchItemDto[]
}

function normalizeTargets(input: ImageBatchTargetInput[]): ImageBatchTargetInput[] {
  const seen = new Set<string>()
  return input.map((target) => {
    const key = target.key.trim()
    if (!key || seen.has(key)) throw new Error("批次目标标识重复或为空")
    seen.add(key)
    const prompt = target.prompt.trim()
    if (!prompt) throw new Error(`「${target.name}」缺少图像提示词`)
    return {
      ...target,
      key,
      name: target.name.trim().slice(0, 80) || key,
      targetId: target.targetId.trim(),
      prompt,
    }
  })
}

function targetExists(
  db: DatabaseSync,
  projectId: string,
  type: GenerationTargetType,
  targetId: string,
): boolean {
  const kind = type === "character"
    ? "visualCharacters"
    : type === "place"
      ? "visualPlaces"
      : "shots"
  const snapshot = latestSnapshot(db, projectId, kind)
  if (!snapshot || !Array.isArray(snapshot.payload)) return false
  return snapshot.payload.some((item) => {
    if (!item || typeof item !== "object") return false
    const record = item as Record<string, unknown>
    return record.entityId === targetId
      || record.id === targetId
      || (
        type === "place"
        && typeof record.name === "string"
        && placeGenerationTargetId(record.name) === targetId
      )
  })
}

/**
 * 一次性创建持久化图像批次和任务。批次提交只占一次 API 限流；
 * 任务在 Worker 中按额度预扣、供应商并发和退避策略执行。
 */
export function enqueueImageBatch(
  db: DatabaseSync,
  input: {
    projectId: string
    identity: string
    targets: ImageBatchTargetInput[]
    look: LookBook
    idempotencyKey: string
    priority?: number
    concurrency?: number
  },
): ImageBatchStateDto {
  const targets = normalizeTargets(input.targets)
  if (targets.length === 0) throw new Error("请选择至少一项图像目标")
  if (targets.length > 200) throw new Error("单个图像批次最多 200 项")

  for (const target of targets) {
    if (!targetExists(db, input.projectId, target.targetType, target.targetId)) {
      throw new Error(`目标「${target.name}」不存在，请刷新项目后重试`)
    }
  }

  const existing = db.prepare(
    `SELECT id FROM generation_batches
     WHERE project_id = ? AND idempotency_key = ?`,
  ).get(input.projectId, input.idempotencyKey) as { id: string } | undefined
  if (existing) return getImageBatchState(db, existing.id, input.projectId)

  const quota = getQuota(db, input.identity)
  const estimatedUnits = targets.length * IMAGE_GENERATION_UNITS
  if (!quota.unlimited && quota.remaining < estimatedUnits) {
    throw new QuotaError(
      `本批预计需要 ${estimatedUnits} 单位，当前仅剩 ${quota.remaining} 单位。请减少图片数量或等待额度恢复。`,
    )
  }

  const batch = createGenerationBatch(db, {
    projectId: input.projectId,
    scope: {
      kind: "image",
      targetCount: targets.length,
      targetTypes: [...new Set(targets.map((target) => target.targetType))],
    },
    mediaKind: "image" satisfies MediaKind,
    priority: input.priority ?? 0,
    concurrency: input.concurrency ?? 2,
    idempotencyKey: input.idempotencyKey,
    status: "confirmed",
  })

  const reservations: string[] = []
  try {
    for (const target of targets) {
      const reservation = reserveQuota(db, input.identity, "image", {
        units: IMAGE_GENERATION_UNITS,
        requestId: `${input.idempotencyKey}:${target.key}`,
      })
      reservations.push(reservation.id)
      createGenerationTask(db, {
        projectId: input.projectId,
        targetType: target.targetType,
        targetId: target.targetId,
        providerId: "aliyun",
        model: "auto",
        prompt: target.prompt,
        mediaKind: "image",
        batchId: batch.id,
        maxAttempts: 3,
        request: {
          aspect: target.aspect,
          look: input.look,
          batchKey: target.key,
          batchName: target.name,
          autoSelect: false,
        },
        idempotencyKey: `${input.idempotencyKey}:${target.key}`,
        quotaReservationId: reservation.id,
        quotaUnits: IMAGE_GENERATION_UNITS,
        nextPollAt: Date.now(),
      })
    }
  } catch (error) {
    for (const reservationId of reservations) {
      db.prepare(
        "UPDATE usage_reservations SET status = 'released', reason = ? WHERE id = ? AND status = 'reserved'",
      ).run("image_batch_enqueue_failed", reservationId)
    }
    db.prepare("DELETE FROM generation_tasks WHERE batch_id = ?").run(batch.id)
    db.prepare("DELETE FROM generation_batches WHERE id = ?").run(batch.id)
    throw error
  }

  return getImageBatchState(db, batch.id, input.projectId)
}

function batchQueuePosition(db: DatabaseSync, batch: GenerationBatch): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS n
     FROM generation_tasks t
     JOIN generation_batches b ON b.id = t.batch_id
     WHERE t.media_kind = 'image'
       AND t.status = 'queued'
       AND b.media_kind = 'image'
       AND b.paused_at IS NULL
       AND b.status IN ('confirmed', 'running')
       AND (
         b.priority > ?
         OR (b.priority = ? AND t.created_at < (
           SELECT MIN(created_at) FROM generation_tasks WHERE batch_id = ?
         ))
       )`,
  ).get(batch.priority, batch.priority, batch.id) as { n: number }
  return Number(row.n)
}

export function getImageBatchState(
  db: DatabaseSync,
  batchId: string,
  expectedProjectId?: string,
): ImageBatchStateDto {
  const batch = getGenerationBatch(db, batchId)
  if (!batch || batch.mediaKind !== "image") throw new Error("图像批次不存在")
  if (expectedProjectId && batch.projectId !== expectedProjectId) throw new Error("图像批次不属于当前项目")
  const tasks = listGenerationTasksByBatch(db, batch.id)
  const items = tasks.map((task) => {
    const request = task.request ?? {}
    return {
      taskId: task.id,
      key: typeof request.batchKey === "string" ? request.batchKey : task.id,
      name: typeof request.batchName === "string" ? request.batchName : task.targetId,
      targetType: task.targetType,
      targetId: task.targetId,
      status: task.status,
      error: task.error,
      attempt: task.attempt ?? 1,
      maxAttempts: task.maxAttempts ?? 3,
      nextPollAt: task.nextPollAt ?? null,
      asset: task.assetId ? getGeneratedAsset(db, task.assetId, batch.projectId) : null,
    }
  })
  const counts = {
    total: items.length,
    queued: items.filter((item) => item.status === "queued").length,
    running: items.filter((item) => item.status === "running").length,
    succeeded: items.filter((item) => item.status === "succeeded").length,
    failed: items.filter((item) => item.status === "failed").length,
    canceled: items.filter((item) => item.status === "canceled").length,
  }
  const queuePosition = batchQueuePosition(db, batch)
  const averageSeconds = Math.max(10, Number(process.env.IMAGE_AVERAGE_SECONDS ?? 45))
  const lanes = Math.max(1, batch.concurrency)
  const estimatedSeconds = Math.ceil(
    ((queuePosition + counts.queued + counts.running) / lanes) * averageSeconds,
  )
  return { batch, counts, queuePosition, estimatedSeconds, items }
}

/** 所有批次写操作都先核对项目归属，防止只拿到 batchId 就跨项目修改。 */
function imageBatchForProject(
  db: DatabaseSync,
  batchId: string,
  expectedProjectId: string,
): GenerationBatch {
  const batch = getGenerationBatch(db, batchId)
  if (!batch || batch.mediaKind !== "image") throw new Error("图像批次不存在")
  if (batch.projectId !== expectedProjectId) {
    const error = new Error("图像批次不属于当前项目") as Error & { status: number }
    error.status = 404
    throw error
  }
  return batch
}

export function pauseImageBatch(
  db: DatabaseSync,
  batchId: string,
  expectedProjectId: string,
): ImageBatchStateDto {
  imageBatchForProject(db, batchId, expectedProjectId)
  db.prepare("UPDATE generation_batches SET paused_at = ? WHERE id = ?").run(Date.now(), batchId)
  return getImageBatchState(db, batchId, expectedProjectId)
}

export function resumeImageBatch(
  db: DatabaseSync,
  batchId: string,
  expectedProjectId: string,
): ImageBatchStateDto {
  imageBatchForProject(db, batchId, expectedProjectId)
  db.prepare("UPDATE generation_batches SET paused_at = NULL WHERE id = ?").run(batchId)
  return getImageBatchState(db, batchId, expectedProjectId)
}

export function cancelImageBatch(
  db: DatabaseSync,
  batchId: string,
  expectedProjectId: string,
  reason = "用户已取消批次",
): ImageBatchStateDto {
  imageBatchForProject(db, batchId, expectedProjectId)
  db.prepare("UPDATE generation_batches SET paused_at = ? WHERE id = ?").run(Date.now(), batchId)
  for (const task of listGenerationTasksByBatch(db, batchId)) {
    if (task.status === "queued") cancelGenerationTask(db, task.id, reason)
  }
  return getImageBatchState(db, batchId, expectedProjectId)
}

export function retryFailedImageBatch(
  db: DatabaseSync,
  batchId: string,
  identity: string,
  expectedProjectId: string,
): ImageBatchStateDto {
  imageBatchForProject(db, batchId, expectedProjectId)
  const failed = listGenerationTasksByBatch(db, batchId)
    .filter((task) => task.status === "failed")
  for (const task of failed) {
    const reservation = reserveQuota(db, identity, "image", {
      units: IMAGE_GENERATION_UNITS,
      requestId: `retry:${task.id}:${Date.now()}`,
    })
    db.prepare(
      `UPDATE generation_tasks
       SET status = 'queued',
           error = NULL,
           finished_at = NULL,
           started_at = NULL,
           attempt = 1,
           next_poll_at = ?,
           quota_reservation_id = ?,
           quota_units = ?
       WHERE id = ?`,
    ).run(Date.now(), reservation.id, IMAGE_GENERATION_UNITS, task.id)
  }
  db.prepare("UPDATE generation_batches SET paused_at = NULL WHERE id = ?").run(batchId)
  return getImageBatchState(db, batchId, expectedProjectId)
}

export function retryFailedImageTask(
  db: DatabaseSync,
  batchId: string,
  identity: string,
  targetKey: string,
  expectedProjectId: string,
): ImageBatchStateDto {
  imageBatchForProject(db, batchId, expectedProjectId)
  const task = listGenerationTasksByBatch(db, batchId).find((item) => {
    const key = item.request?.batchKey
    return key === targetKey && item.status === "failed"
  })
  if (!task) throw new Error("失败项不存在或已经重新排队")
  const reservation = reserveQuota(db, identity, "image", {
    units: IMAGE_GENERATION_UNITS,
    requestId: `retry:${task.id}:${Date.now()}`,
  })
  db.prepare(
    `UPDATE generation_tasks
     SET status = 'queued',
         error = NULL,
         finished_at = NULL,
         started_at = NULL,
         attempt = 1,
         next_poll_at = ?,
         quota_reservation_id = ?,
         quota_units = ?
     WHERE id = ? AND status = 'failed'`,
  ).run(Date.now(), reservation.id, IMAGE_GENERATION_UNITS, task.id)
  db.prepare("UPDATE generation_batches SET paused_at = NULL WHERE id = ?").run(batchId)
  return getImageBatchState(db, batchId, expectedProjectId)
}

export function setImageBatchPriority(
  db: DatabaseSync,
  batchId: string,
  priority: number,
  expectedProjectId: string,
): ImageBatchStateDto {
  imageBatchForProject(db, batchId, expectedProjectId)
  db.prepare("UPDATE generation_batches SET priority = ? WHERE id = ?")
    .run(Math.max(0, Math.min(100, Math.floor(priority))), batchId)
  return getImageBatchState(db, batchId, expectedProjectId)
}
