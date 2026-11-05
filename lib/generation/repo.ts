import type { DatabaseSync } from "node:sqlite"
import { createHash, randomUUID } from "node:crypto"

import type {
  GeneratedAsset,
  GenerationBatch,
  GenerationStatus,
  GenerationTargetType,
  GenerationTask,
  MediaKind,
} from "./types.ts"

export type {
  GeneratedAsset,
  GenerationBatch,
  GenerationStatus,
  GenerationTargetType,
  GenerationTask,
  MediaKind,
} from "./types.ts"

interface TaskRow {
  id: string
  project_id: string
  target_type: string
  target_id: string
  provider_id: string
  model: string
  prompt: string
  prompt_hash: string
  status: string
  error: string | null
  asset_id: string | null
  media_kind: string
  batch_id: string | null
  provider_task_id: string | null
  provider_status: string | null
  request_json: string
  pricing_version: string | null
  estimated_cost_micros: number
  actual_cost_micros: number
  max_attempts: number
  attempt: number
  retry_of_task_id: string | null
  idempotency_key: string | null
  next_poll_at: number | null
  created_at: number
  started_at: number | null
  finished_at: number | null
}

interface AssetRow {
  id: string
  task_id: string
  project_id: string
  target_type: string
  target_id: string
  storage_key: string
  mime: string
  bytes: number
  provider_id: string
  model: string
  prompt: string
  media_kind: string
  duration_ms: number | null
  width: number | null
  height: number | null
  fps: number | null
  sha256: string | null
  poster_storage_key: string | null
  source_asset_ids_json: string
  generation_meta_json: string
  selected_at: number | null
  created_at: number
}

interface BatchRow {
  id: string
  project_id: string
  episode: number
  scope_json: string
  status: string
  budget_limit_micros: number
  reserved_cost_micros: number
  actual_cost_micros: number
  idempotency_key: string | null
  created_at: number
  confirmed_at: number | null
  finished_at: number | null
}

function readObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function readStringArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
      : []
  } catch {
    return []
  }
}

function toTask(row: TaskRow): GenerationTask {
  return {
    id: row.id,
    projectId: row.project_id,
    targetType: row.target_type as GenerationTargetType,
    targetId: row.target_id,
    providerId: row.provider_id,
    model: row.model,
    prompt: row.prompt,
    promptHash: row.prompt_hash,
    status: row.status as GenerationStatus,
    error: row.error,
    assetId: row.asset_id,
    mediaKind: row.media_kind as MediaKind,
    batchId: row.batch_id,
    providerTaskId: row.provider_task_id,
    providerStatus: row.provider_status,
    request: readObject(row.request_json),
    pricingVersion: row.pricing_version,
    estimatedCostMicros: row.estimated_cost_micros,
    actualCostMicros: row.actual_cost_micros,
    maxAttempts: row.max_attempts,
    attempt: row.attempt,
    retryOfTaskId: row.retry_of_task_id,
    idempotencyKey: row.idempotency_key,
    nextPollAt: row.next_poll_at,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

function toAsset(row: AssetRow): GeneratedAsset {
  return {
    id: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    targetType: row.target_type as GenerationTargetType,
    targetId: row.target_id,
    storageKey: row.storage_key,
    mime: row.mime,
    bytes: row.bytes,
    providerId: row.provider_id,
    model: row.model,
    prompt: row.prompt,
    mediaKind: row.media_kind as MediaKind,
    durationMs: row.duration_ms,
    width: row.width,
    height: row.height,
    fps: row.fps,
    sha256: row.sha256,
    posterStorageKey: row.poster_storage_key,
    sourceAssetIds: readStringArray(row.source_asset_ids_json),
    generationMeta: readObject(row.generation_meta_json),
    selectedAt: row.selected_at,
    createdAt: row.created_at,
    downloadUrl: `/api/generated-assets/${row.id}`,
  }
}

function toBatch(row: BatchRow): GenerationBatch {
  return {
    id: row.id,
    projectId: row.project_id,
    episode: row.episode,
    scope: readObject(row.scope_json),
    status: row.status as GenerationBatch["status"],
    budgetLimitMicros: row.budget_limit_micros,
    reservedCostMicros: row.reserved_cost_micros,
    actualCostMicros: row.actual_cost_micros,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    finishedAt: row.finished_at,
  }
}

function syncGenerationBatch(db: DatabaseSync, batchId: string | null | undefined): void {
  if (!batchId) return
  const aggregate = db.prepare(
    `SELECT
       SUM(CASE WHEN status IN ('queued', 'running') THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) AS canceled,
       SUM(CASE WHEN status IN ('queued', 'running') THEN estimated_cost_micros ELSE 0 END) AS reserved,
       SUM(CASE WHEN status IN ('succeeded', 'failed', 'canceled') THEN actual_cost_micros ELSE 0 END) AS actual
     FROM generation_tasks
     WHERE batch_id = ?`,
  ).get(batchId) as {
    active: number | null
    succeeded: number | null
    failed: number | null
    canceled: number | null
    reserved: number | null
    actual: number | null
  }
  const active = Number(aggregate.active ?? 0)
  const succeeded = Number(aggregate.succeeded ?? 0)
  const failed = Number(aggregate.failed ?? 0)
  const canceled = Number(aggregate.canceled ?? 0)
  if (active + succeeded + failed + canceled === 0) return
  const status: GenerationBatch["status"] = active > 0
    ? "running"
    : succeeded > 0 && failed === 0 && canceled === 0
      ? "completed"
      : succeeded === 0 && failed > 0 && canceled === 0
        ? "failed"
        : "stopped"
  db.prepare(
    `UPDATE generation_batches
     SET status = ?, reserved_cost_micros = ?, actual_cost_micros = ?, finished_at = ?
     WHERE id = ?`,
  ).run(
    status,
    Number(aggregate.reserved ?? 0),
    Number(aggregate.actual ?? 0),
    active > 0 ? null : Date.now(),
    batchId,
  )
}

export function createGenerationTask(
  db: DatabaseSync,
  input: {
    projectId: string
    targetType: GenerationTargetType
    targetId: string
    providerId: string
    model: string
    prompt: string
    mediaKind?: MediaKind
    batchId?: string | null
    providerTaskId?: string | null
    providerStatus?: string | null
    request?: Record<string, unknown>
    pricingVersion?: string | null
    estimatedCostMicros?: number
    actualCostMicros?: number
    maxAttempts?: number
    attempt?: number
    retryOfTaskId?: string | null
    idempotencyKey?: string | null
    nextPollAt?: number | null
  },
): GenerationTask {
  const idempotencyKey = input.idempotencyKey?.trim() || null
  if (idempotencyKey) {
    const existing = db.prepare(
      "SELECT * FROM generation_tasks WHERE project_id = ? AND idempotency_key = ?",
    ).get(input.projectId, idempotencyKey) as TaskRow | undefined
    if (existing) return toTask(existing)
  }
  const id = randomUUID()
  const now = Date.now()
  const promptHash = createHash("sha256").update(input.prompt).digest("hex")
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO generation_tasks
        (id, project_id, target_type, target_id, provider_id, model, prompt, prompt_hash,
         status, media_kind, batch_id, provider_task_id, provider_status, request_json,
         pricing_version, estimated_cost_micros, actual_cost_micros, max_attempts,
         attempt, retry_of_task_id, idempotency_key, next_poll_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      input.targetType,
      input.targetId,
      input.providerId,
      input.model,
      input.prompt,
      promptHash,
      input.mediaKind ?? "image",
      input.batchId ?? null,
      input.providerTaskId ?? null,
      input.providerStatus ?? null,
      JSON.stringify(input.request ?? {}),
      input.pricingVersion ?? null,
      Math.max(0, Math.floor(input.estimatedCostMicros ?? 0)),
      Math.max(0, Math.floor(input.actualCostMicros ?? 0)),
      Math.max(0, Math.floor(input.maxAttempts ?? 0)),
      Math.max(1, Math.floor(input.attempt ?? 1)),
      input.retryOfTaskId ?? null,
      idempotencyKey,
      input.nextPollAt ?? now,
      now,
    )
    syncGenerationBatch(db, input.batchId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getGenerationTask(db, id)!
}

export function createGenerationBatch(
  db: DatabaseSync,
  input: {
    projectId: string
    episode?: number
    scope: Record<string, unknown>
    budgetLimitMicros?: number
    status?: GenerationBatch["status"]
    idempotencyKey?: string | null
  },
): GenerationBatch {
  const idempotencyKey = input.idempotencyKey?.trim() || null
  if (idempotencyKey) {
    const existing = db.prepare(
      "SELECT * FROM generation_batches WHERE project_id = ? AND idempotency_key = ?",
    ).get(input.projectId, idempotencyKey) as BatchRow | undefined
    if (existing) return toBatch(existing)
  }
  const id = randomUUID()
  const now = Date.now()
  const status = input.status ?? "confirmed"
  db.prepare(
    `INSERT INTO generation_batches
      (id, project_id, episode, scope_json, status, budget_limit_micros,
       reserved_cost_micros, actual_cost_micros, idempotency_key,
       created_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
  ).run(
    id,
    input.projectId,
    Math.max(0, Math.floor(input.episode ?? 0)),
    JSON.stringify(input.scope),
    status,
    Math.max(0, Math.floor(input.budgetLimitMicros ?? 0)),
    idempotencyKey,
    now,
    status === "draft" ? null : now,
  )
  return getGenerationBatch(db, id)!
}

export function getGenerationBatch(db: DatabaseSync, id: string): GenerationBatch | null {
  const row = db.prepare("SELECT * FROM generation_batches WHERE id = ?").get(id) as
    | BatchRow
    | undefined
  return row ? toBatch(row) : null
}

export function listGenerationBatches(
  db: DatabaseSync,
  projectId: string,
): GenerationBatch[] {
  const rows = db.prepare(
    "SELECT * FROM generation_batches WHERE project_id = ? ORDER BY created_at DESC",
  ).all(projectId) as BatchRow[]
  return rows.map(toBatch)
}

export function getGenerationTask(db: DatabaseSync, id: string): GenerationTask | null {
  const row = db.prepare("SELECT * FROM generation_tasks WHERE id = ?").get(id) as TaskRow | undefined
  return row ? toTask(row) : null
}

export function markGenerationTaskRunning(db: DatabaseSync, id: string): GenerationTask {
  const now = Date.now()
  db.prepare(
    "UPDATE generation_tasks SET status = 'running', started_at = ?, error = NULL WHERE id = ? AND status = 'queued'",
  ).run(now, id)
  const task = getGenerationTask(db, id)
  if (!task) throw new Error("生成任务不存在")
  return task
}

export function updateGenerationProviderTask(
  db: DatabaseSync,
  id: string,
  input: {
    providerTaskId: string
    providerStatus?: string | null
    nextPollAt?: number | null
  },
): GenerationTask {
  db.prepare(
    `UPDATE generation_tasks
     SET provider_task_id = ?, provider_status = ?, next_poll_at = ?
     WHERE id = ?`,
  ).run(
    input.providerTaskId.trim(),
    input.providerStatus?.trim() || null,
    input.nextPollAt ?? Date.now(),
    id,
  )
  const task = getGenerationTask(db, id)
  if (!task) throw new Error("生成任务不存在")
  return task
}

export function updateGenerationProviderStatus(
  db: DatabaseSync,
  id: string,
  input: {
    providerStatus?: string | null
    nextPollAt?: number | null
  },
): GenerationTask {
  db.prepare(
    "UPDATE generation_tasks SET provider_status = ?, next_poll_at = ? WHERE id = ?",
  ).run(
    input.providerStatus?.trim() || null,
    input.nextPollAt ?? Date.now(),
    id,
  )
  const task = getGenerationTask(db, id)
  if (!task) throw new Error("生成任务不存在")
  return task
}

export function completeGenerationTask(
  db: DatabaseSync,
  id: string,
  assetId: string,
): GenerationTask {
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `UPDATE generation_tasks
       SET status = 'succeeded',
           asset_id = ?,
           error = NULL,
           actual_cost_micros = CASE
             WHEN actual_cost_micros > 0 THEN actual_cost_micros
             ELSE estimated_cost_micros
           END,
           finished_at = ?
       WHERE id = ?`,
    ).run(assetId, Date.now(), id)
    const current = getGenerationTask(db, id)
    syncGenerationBatch(db, current?.batchId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  const task = getGenerationTask(db, id)
  if (!task) throw new Error("生成任务不存在")
  return task
}

export function failGenerationTask(db: DatabaseSync, id: string, error: string): GenerationTask {
  const message = error.trim().slice(0, 300) || "生成失败，请重试"
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      "UPDATE generation_tasks SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
    ).run(message, Date.now(), id)
    const current = getGenerationTask(db, id)
    syncGenerationBatch(db, current?.batchId)
    db.exec("COMMIT")
  } catch (rollbackError) {
    db.exec("ROLLBACK")
    throw rollbackError
  }
  const task = getGenerationTask(db, id)
  if (!task) throw new Error("生成任务不存在")
  return task
}

export function cancelGenerationTask(
  db: DatabaseSync,
  id: string,
  reason = "已停止等待",
): GenerationTask {
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      "UPDATE generation_tasks SET status = 'canceled', error = ?, finished_at = ? WHERE id = ? AND status IN ('queued', 'running')",
    ).run(reason.trim().slice(0, 300), Date.now(), id)
    const current = getGenerationTask(db, id)
    syncGenerationBatch(db, current?.batchId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  const task = getGenerationTask(db, id)
  if (!task) throw new Error("生成任务不存在")
  return task
}

export function listGenerationTasks(
  db: DatabaseSync,
  projectId: string,
  targetType?: GenerationTargetType,
  targetId?: string,
  mediaKind?: MediaKind,
): GenerationTask[] {
  const clauses = ["project_id = ?"]
  const params: Array<string> = [projectId]
  if (targetType && targetId) {
    clauses.push("target_type = ?", "target_id = ?")
    params.push(targetType, targetId)
  }
  if (mediaKind) {
    clauses.push("media_kind = ?")
    params.push(mediaKind)
  }
  const rows = db.prepare(
    `SELECT * FROM generation_tasks WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`,
  ).all(...params)
  return (rows as TaskRow[]).map(toTask)
}

export function reconcileStaleGenerationTasks(
  db: DatabaseSync,
  projectId: string,
  now = Date.now(),
  staleAfterMs = 10 * 60 * 1000,
): number {
  const cutoff = now - Math.max(1, Math.floor(staleAfterMs))
  const result = db.prepare(
    `UPDATE generation_tasks
     SET status = 'failed',
         error = ?,
         finished_at = ?
     WHERE project_id = ?
       AND media_kind = 'image'
       AND (
         (status = 'queued' AND created_at < ?)
         OR (status = 'running' AND COALESCE(started_at, created_at) < ?)
       )`,
  ).run(
    "上次生成等待已中断，可重试。通义侧远端任务可能仍会完成，但不会写入当前项目。",
    now,
    projectId,
    cutoff,
    cutoff,
  )
  return Number(result.changes)
}

export function saveGeneratedAsset(
  db: DatabaseSync,
  input: {
    taskId: string
    projectId: string
    targetType: GenerationTargetType
    targetId: string
    storageKey: string
    mime: string
    bytes: number
    providerId: string
    model: string
    prompt: string
    mediaKind?: MediaKind
    durationMs?: number | null
    width?: number | null
    height?: number | null
    fps?: number | null
    sha256?: string | null
    posterStorageKey?: string | null
    sourceAssetIds?: string[]
    generationMeta?: Record<string, unknown>
  },
): GeneratedAsset {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO generated_assets
      (id, task_id, project_id, target_type, target_id, storage_key, mime, bytes,
       provider_id, model, prompt, media_kind, duration_ms, width, height, fps,
       sha256, poster_storage_key, source_asset_ids_json, generation_meta_json,
       selected_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    id,
    input.taskId,
    input.projectId,
    input.targetType,
    input.targetId,
    input.storageKey,
    input.mime,
    input.bytes,
    input.providerId,
    input.model,
    input.prompt,
    input.mediaKind ?? "image",
    input.durationMs ?? null,
    input.width ?? null,
    input.height ?? null,
    input.fps ?? null,
    input.sha256 ?? null,
    input.posterStorageKey ?? null,
    JSON.stringify(input.sourceAssetIds ?? []),
    JSON.stringify(input.generationMeta ?? {}),
    now,
  )
  return getGeneratedAsset(db, id, input.projectId)!
}

export function getGeneratedAsset(
  db: DatabaseSync,
  id: string,
  projectId: string,
): GeneratedAsset | null {
  const row = db.prepare(
    "SELECT * FROM generated_assets WHERE id = ? AND project_id = ?",
  ).get(id, projectId) as AssetRow | undefined
  return row ? toAsset(row) : null
}

export function findGeneratedAssetById(
  db: DatabaseSync,
  id: string,
): GeneratedAsset | null {
  const row = db.prepare("SELECT * FROM generated_assets WHERE id = ?").get(id) as AssetRow | undefined
  return row ? toAsset(row) : null
}

export function listGeneratedAssets(
  db: DatabaseSync,
  projectId: string,
  targetType?: GenerationTargetType,
  targetId?: string,
  mediaKind?: MediaKind,
): GeneratedAsset[] {
  const clauses = ["project_id = ?"]
  const params: Array<string> = [projectId]
  if (targetType && targetId) {
    clauses.push("target_type = ?", "target_id = ?")
    params.push(targetType, targetId)
  }
  if (mediaKind) {
    clauses.push("media_kind = ?")
    params.push(mediaKind)
  }
  const rows = db.prepare(
    `SELECT * FROM generated_assets
     WHERE ${clauses.join(" AND ")}
     ORDER BY CASE WHEN selected_at IS NOT NULL THEN 0 ELSE 1 END, created_at DESC`,
  ).all(...params)
  return (rows as AssetRow[]).map(toAsset)
}

export function selectGeneratedAsset(
  db: DatabaseSync,
  projectId: string,
  assetId: string,
): GeneratedAsset {
  const asset = getGeneratedAsset(db, assetId, projectId)
  if (!asset) throw new Error("关键帧不存在或无权访问")
  const now = Date.now()
  db.exec("BEGIN")
  try {
    db.prepare(
      `UPDATE generated_assets SET selected_at = NULL
       WHERE project_id = ? AND target_type = ? AND target_id = ? AND media_kind = ?`,
    ).run(projectId, asset.targetType, asset.targetId, asset.mediaKind)
    db.prepare("UPDATE generated_assets SET selected_at = ? WHERE id = ?").run(now, assetId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getGeneratedAsset(db, assetId, projectId)!
}
