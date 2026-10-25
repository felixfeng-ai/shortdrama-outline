import type { DatabaseSync } from "node:sqlite"
import { createHash, randomUUID } from "node:crypto"

import type {
  GeneratedAsset,
  GenerationStatus,
  GenerationTargetType,
  GenerationTask,
} from "./types.ts"

export type {
  GeneratedAsset,
  GenerationStatus,
  GenerationTargetType,
  GenerationTask,
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
  selected_at: number | null
  created_at: number
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
    selectedAt: row.selected_at,
    createdAt: row.created_at,
    downloadUrl: `/api/generated-assets/${row.id}`,
  }
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
  },
): GenerationTask {
  const id = randomUUID()
  const now = Date.now()
  const promptHash = createHash("sha256").update(input.prompt).digest("hex")
  db.prepare(
    `INSERT INTO generation_tasks
      (id, project_id, target_type, target_id, provider_id, model, prompt, prompt_hash, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
  ).run(
    id,
    input.projectId,
    input.targetType,
    input.targetId,
    input.providerId,
    input.model,
    input.prompt,
    promptHash,
    now,
  )
  return getGenerationTask(db, id)!
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

export function completeGenerationTask(
  db: DatabaseSync,
  id: string,
  assetId: string,
): GenerationTask {
  db.prepare(
    "UPDATE generation_tasks SET status = 'succeeded', asset_id = ?, error = NULL, finished_at = ? WHERE id = ?",
  ).run(assetId, Date.now(), id)
  const task = getGenerationTask(db, id)
  if (!task) throw new Error("生成任务不存在")
  return task
}

export function failGenerationTask(db: DatabaseSync, id: string, error: string): GenerationTask {
  const message = error.trim().slice(0, 300) || "生成失败，请重试"
  db.prepare(
    "UPDATE generation_tasks SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
  ).run(message, Date.now(), id)
  const task = getGenerationTask(db, id)
  if (!task) throw new Error("生成任务不存在")
  return task
}

export function cancelGenerationTask(
  db: DatabaseSync,
  id: string,
  reason = "已停止等待",
): GenerationTask {
  db.prepare(
    "UPDATE generation_tasks SET status = 'canceled', error = ?, finished_at = ? WHERE id = ? AND status IN ('queued', 'running')",
  ).run(reason.trim().slice(0, 300), Date.now(), id)
  const task = getGenerationTask(db, id)
  if (!task) throw new Error("生成任务不存在")
  return task
}

export function listGenerationTasks(
  db: DatabaseSync,
  projectId: string,
  targetType?: GenerationTargetType,
  targetId?: string,
): GenerationTask[] {
  const rows = targetType && targetId
    ? db.prepare(
      "SELECT * FROM generation_tasks WHERE project_id = ? AND target_type = ? AND target_id = ? ORDER BY created_at DESC",
    ).all(projectId, targetType, targetId)
    : db.prepare(
      "SELECT * FROM generation_tasks WHERE project_id = ? ORDER BY created_at DESC",
    ).all(projectId)
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
  },
): GeneratedAsset {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO generated_assets
      (id, task_id, project_id, target_type, target_id, storage_key, mime, bytes,
       provider_id, model, prompt, selected_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
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
): GeneratedAsset[] {
  const rows = targetType && targetId
    ? db.prepare(
      `SELECT * FROM generated_assets
       WHERE project_id = ? AND target_type = ? AND target_id = ?
       ORDER BY CASE WHEN selected_at IS NOT NULL THEN 0 ELSE 1 END, created_at DESC`,
    ).all(projectId, targetType, targetId)
    : db.prepare(
      `SELECT * FROM generated_assets
       WHERE project_id = ?
       ORDER BY CASE WHEN selected_at IS NOT NULL THEN 0 ELSE 1 END, created_at DESC`,
    ).all(projectId)
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
       WHERE project_id = ? AND target_type = ? AND target_id = ?`,
    ).run(projectId, asset.targetType, asset.targetId)
    db.prepare("UPDATE generated_assets SET selected_at = ? WHERE id = ?").run(now, assetId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getGeneratedAsset(db, assetId, projectId)!
}
