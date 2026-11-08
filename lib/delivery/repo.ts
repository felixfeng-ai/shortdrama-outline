import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import {
  readDeliveryPlatform,
  readDeliverySubtitleMode,
  type DeliveryPlatform,
  type DeliverySubtitleMode,
} from "./platforms.ts"
import type {
  DeliveryItem,
  DeliveryItemStatus,
  DeliveryPackage,
  DeliveryPackageScope,
  DeliveryPackageStatus,
  DeliveryReviewStatus,
} from "./types.ts"

interface DeliveryPackageRow {
  id: string
  project_id: string
  title: string
  scope: string
  platform: string
  subtitle_mode: string
  status: string
  review_status: string
  progress: number
  error: string | null
  package_storage_key: string | null
  manifest_storage_key: string | null
  total_quota_units: number
  created_at: number
  updated_at: number
  finished_at: number | null
}

interface DeliveryItemRow {
  id: string
  package_id: string
  episode: number
  render_id: string
  status: string
  error: string | null
  clean_video_key: string | null
  publish_video_key: string | null
  srt_key: string | null
  ass_key: string | null
  cover_key: string | null
  metadata_json: string
  created_at: number
  updated_at: number
}

function packageStatus(value: string): DeliveryPackageStatus {
  return value === "running" || value === "ready" || value === "failed"
    ? value
    : "queued"
}

function reviewStatus(value: string): DeliveryReviewStatus {
  return value === "pending" || value === "approved" || value === "changes_requested"
    ? value
    : "not_requested"
}

function itemStatus(value: string): DeliveryItemStatus {
  return value === "running" || value === "ready" || value === "failed"
    ? value
    : "queued"
}

function toPackage(row: DeliveryPackageRow): DeliveryPackage {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    scope: row.scope === "series" ? "series" : "episode",
    platform: readDeliveryPlatform(row.platform),
    subtitleMode: readDeliverySubtitleMode(row.subtitle_mode),
    status: packageStatus(row.status),
    reviewStatus: reviewStatus(row.review_status),
    progress: Math.max(0, Math.min(100, Number(row.progress))),
    error: row.error,
    packageStorageKey: row.package_storage_key,
    manifestStorageKey: row.manifest_storage_key,
    totalQuotaUnits: Math.max(0, Number(row.total_quota_units)),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
  }
}

function toItem(row: DeliveryItemRow): DeliveryItem {
  return {
    id: row.id,
    packageId: row.package_id,
    episode: Math.max(1, Number(row.episode)),
    renderId: row.render_id,
    status: itemStatus(row.status),
    error: row.error,
    cleanVideoKey: row.clean_video_key,
    publishVideoKey: row.publish_video_key,
    srtKey: row.srt_key,
    assKey: row.ass_key,
    coverKey: row.cover_key,
    metadataJson: row.metadata_json || "{}",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function getDeliveryPackage(
  db: DatabaseSync,
  projectId: string,
  id: string,
): DeliveryPackage | null {
  const row = db.prepare(
    "SELECT * FROM video_delivery_packages WHERE id = ? AND project_id = ?",
  ).get(id, projectId) as DeliveryPackageRow | undefined
  return row ? toPackage(row) : null
}

export function getDeliveryPackageById(
  db: DatabaseSync,
  id: string,
): DeliveryPackage | null {
  const row = db.prepare(
    "SELECT * FROM video_delivery_packages WHERE id = ?",
  ).get(id) as DeliveryPackageRow | undefined
  return row ? toPackage(row) : null
}

export function listDeliveryPackages(
  db: DatabaseSync,
  projectId: string,
): DeliveryPackage[] {
  return (db.prepare(
    "SELECT * FROM video_delivery_packages WHERE project_id = ? ORDER BY created_at DESC",
  ).all(projectId) as DeliveryPackageRow[]).map(toPackage)
}

export function listDeliveryItems(
  db: DatabaseSync,
  packageId: string,
): DeliveryItem[] {
  return (db.prepare(
    "SELECT * FROM video_delivery_items WHERE package_id = ? ORDER BY episode ASC",
  ).all(packageId) as DeliveryItemRow[]).map(toItem)
}

export function getDeliveryItem(
  db: DatabaseSync,
  packageId: string,
  itemId: string,
): DeliveryItem | null {
  const row = db.prepare(
    "SELECT * FROM video_delivery_items WHERE id = ? AND package_id = ?",
  ).get(itemId, packageId) as DeliveryItemRow | undefined
  return row ? toItem(row) : null
}

export function createDeliveryPackage(
  db: DatabaseSync,
  input: {
    projectId: string
    title: string
    scope: DeliveryPackageScope
    platform: DeliveryPlatform | string
    subtitleMode: DeliverySubtitleMode | string
    items: Array<{ episode: number; renderId: string }>
    idempotencyKey?: string
  },
): DeliveryPackage {
  const projectId = input.projectId.trim()
  const title = input.title.trim().slice(0, 120)
  if (!projectId) throw new InputError("缺少 projectId")
  if (!title) throw new InputError("交付包名称不能为空")
  const scope: DeliveryPackageScope = input.scope === "series" ? "series" : "episode"
  if (scope === "episode" && input.items.length !== 1) {
    throw new InputError("单集交付包只能包含一集")
  }
  if (input.items.length === 0) throw new InputError("交付包至少需要一集")
  const items = input.items
    .map((item) => ({
      episode: Math.max(1, Math.floor(Number(item.episode))),
      renderId: item.renderId.trim(),
    }))
    .sort((left, right) => left.episode - right.episode)
  if (items.some((item) => !item.renderId)) throw new InputError("交付项缺少渲染版本")
  if (new Set(items.map((item) => item.episode)).size !== items.length) {
    throw new InputError("交付包不能包含重复集号")
  }
  const idempotencyKey = input.idempotencyKey?.trim().slice(0, 120) || null
  if (idempotencyKey) {
    const existing = db.prepare(
      "SELECT * FROM video_delivery_packages WHERE project_id = ? AND idempotency_key = ?",
    ).get(projectId, idempotencyKey) as DeliveryPackageRow | undefined
    if (existing) return toPackage(existing)
  }

  const renders = items.map((item) => {
    const row = db.prepare(
      "SELECT id, status, quality_profile, quota_units FROM video_renders WHERE id = ? AND project_id = ?",
    ).get(item.renderId, projectId) as {
      id: string
      status: string
      quality_profile: string
      quota_units: number
    } | undefined
    if (!row) throw new InputError(`第 ${item.episode} 集渲染版本不存在或不属于当前项目`)
    if (row.status !== "succeeded") throw new InputError(`第 ${item.episode} 集成片尚未渲染完成`)
    if (row.quality_profile !== "delivery") {
      throw new InputError(`第 ${item.episode} 集必须使用交付版渲染创建发布包`)
    }
    return { ...item, quotaUnits: Math.max(0, Number(row.quota_units)) }
  })

  const id = randomUUID()
  const now = Date.now()
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO video_delivery_packages
        (id, project_id, title, scope, platform, subtitle_mode, status, review_status,
         progress, total_quota_units, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', 'not_requested', 0, ?, ?, ?, ?)`,
    ).run(
      id,
      projectId,
      title,
      scope,
      readDeliveryPlatform(input.platform),
      readDeliverySubtitleMode(input.subtitleMode),
      renders.reduce((sum, render) => sum + render.quotaUnits, 0),
      idempotencyKey,
      now,
      now,
    )
    const insertItem = db.prepare(
      `INSERT INTO video_delivery_items
        (id, package_id, episode, render_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', ?, ?)`,
    )
    for (const render of renders) {
      insertItem.run(randomUUID(), id, render.episode, render.renderId, now, now)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getDeliveryPackage(db, projectId, id)!
}

export function updateDeliveryPackageProgress(
  db: DatabaseSync,
  id: string,
  progress: number,
): void {
  db.prepare(
    "UPDATE video_delivery_packages SET status = 'running', progress = ?, updated_at = ? WHERE id = ?",
  ).run(Math.max(1, Math.min(99, Math.floor(progress))), Date.now(), id)
}

export function completeDeliveryPackage(
  db: DatabaseSync,
  id: string,
  input: { packageStorageKey: string; manifestStorageKey: string },
): DeliveryPackage {
  const now = Date.now()
  db.prepare(
    `UPDATE video_delivery_packages
     SET status = 'ready', progress = 100, error = NULL, package_storage_key = ?,
         manifest_storage_key = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(input.packageStorageKey, input.manifestStorageKey, now, now, id)
  return getDeliveryPackageById(db, id)!
}

export function failDeliveryPackage(
  db: DatabaseSync,
  id: string,
  message: string,
): DeliveryPackage {
  const now = Date.now()
  db.prepare(
    `UPDATE video_delivery_packages
     SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(message.trim().slice(0, 1_000) || "交付包生成失败", now, now, id)
  return getDeliveryPackageById(db, id)!
}

export function updateDeliveryItem(
  db: DatabaseSync,
  id: string,
  input: {
    status: DeliveryItemStatus
    error?: string | null
    cleanVideoKey?: string | null
    publishVideoKey?: string | null
    srtKey?: string | null
    assKey?: string | null
    coverKey?: string | null
    metadataJson?: string
  },
): void {
  db.prepare(
    `UPDATE video_delivery_items
     SET status = ?, error = ?, clean_video_key = COALESCE(?, clean_video_key),
         publish_video_key = COALESCE(?, publish_video_key),
         srt_key = COALESCE(?, srt_key), ass_key = COALESCE(?, ass_key),
         cover_key = COALESCE(?, cover_key),
         metadata_json = COALESCE(?, metadata_json), updated_at = ?
     WHERE id = ?`,
  ).run(
    input.status,
    input.error ?? null,
    input.cleanVideoKey ?? null,
    input.publishVideoKey ?? null,
    input.srtKey ?? null,
    input.assKey ?? null,
    input.coverKey ?? null,
    input.metadataJson ?? null,
    Date.now(),
    id,
  )
}

export function markDeliveryItemRunning(
  db: DatabaseSync,
  packageId: string,
  itemId: string,
): void {
  db.prepare(
    "UPDATE video_delivery_items SET status = 'running', error = NULL, updated_at = ? WHERE id = ? AND package_id = ?",
  ).run(Date.now(), itemId, packageId)
}

export function claimNextDeliveryPackage(db: DatabaseSync): DeliveryPackage | null {
  db.exec("BEGIN IMMEDIATE")
  try {
    const running = db.prepare(
      "SELECT id FROM video_delivery_packages WHERE status = 'running' LIMIT 1",
    ).get() as { id: string } | undefined
    if (running) {
      db.exec("COMMIT")
      return null
    }
    const next = db.prepare(
      "SELECT * FROM video_delivery_packages WHERE status = 'queued' ORDER BY created_at ASC, rowid ASC LIMIT 1",
    ).get() as DeliveryPackageRow | undefined
    if (!next) {
      db.exec("COMMIT")
      return null
    }
    const now = Date.now()
    db.prepare(
      "UPDATE video_delivery_packages SET status = 'running', progress = 1, updated_at = ? WHERE id = ? AND status = 'queued'",
    ).run(now, next.id)
    db.exec("COMMIT")
    return getDeliveryPackageById(db, next.id)
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function recoverInterruptedDeliveryPackages(db: DatabaseSync): number {
  const result = db.prepare(
    `UPDATE video_delivery_packages
     SET status = 'failed', error = '服务重启时交付包构建中断，请重新创建', finished_at = ?, updated_at = ?
     WHERE status = 'running'`,
  ).run(Date.now(), Date.now())
  return Number(result.changes)
}
