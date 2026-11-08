import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import {
  getDeliveryItem,
  getDeliveryPackageById,
} from "./repo.ts"
import {
  readDeliveryPlatform,
  type DeliveryPlatform,
} from "./platforms.ts"
import type {
  PublishMetric,
  PublishRecord,
  PublishRecordStatus,
} from "./types.ts"

interface PublishRecordRow {
  id: string
  package_id: string
  item_id: string
  platform: string
  status: string
  published_url: string
  published_at: number | null
  note: string
  created_at: number
  updated_at: number
}

interface PublishMetricRow {
  id: string
  publish_record_id: string
  captured_at: number
  views: number
  views_3s: number
  completion_rate: number
  likes: number
  comments: number
  shares: number
  cost_units: number
}

function recordStatus(value: string): PublishRecordStatus {
  return value === "published" || value === "failed" ? value : "ready"
}

function toRecord(row: PublishRecordRow): PublishRecord {
  return {
    id: row.id,
    packageId: row.package_id,
    itemId: row.item_id,
    platform: readDeliveryPlatform(row.platform),
    status: recordStatus(row.status),
    publishedUrl: row.published_url,
    publishedAt: row.published_at === null ? null : Number(row.published_at),
    note: row.note,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function toMetric(row: PublishMetricRow): PublishMetric {
  return {
    id: row.id,
    publishRecordId: row.publish_record_id,
    capturedAt: Number(row.captured_at),
    views: Math.max(0, Number(row.views)),
    views3s: Math.max(0, Number(row.views_3s)),
    completionRate: Math.max(0, Math.min(1, Number(row.completion_rate))),
    likes: Math.max(0, Number(row.likes)),
    comments: Math.max(0, Number(row.comments)),
    shares: Math.max(0, Number(row.shares)),
    costUnits: Math.max(0, Number(row.cost_units)),
  }
}

export function createPublishRecord(
  db: DatabaseSync,
  input: {
    packageId: string
    itemId: string
    platform: DeliveryPlatform | string
    status?: PublishRecordStatus
    publishedUrl?: string
    publishedAt?: number | null
    note?: string
  },
): PublishRecord {
  const pkg = getDeliveryPackageById(db, input.packageId)
  if (!pkg) throw new InputError("交付包不存在")
  if (pkg.status !== "ready") throw new InputError("交付包生成完成后才能记录发布")
  const item = getDeliveryItem(db, pkg.id, input.itemId)
  if (!item || item.status !== "ready") throw new InputError("交付项尚未准备好")
  const status: PublishRecordStatus = input.status === "published" || input.status === "failed"
    ? input.status
    : "ready"
  const publishedUrl = (input.publishedUrl ?? "").trim().slice(0, 2_000)
  if (status === "published" && !/^https?:\/\//i.test(publishedUrl)) {
    throw new InputError("已发布记录必须填写有效的作品链接")
  }
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO video_publish_records
      (id, package_id, item_id, platform, status, published_url, published_at, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    pkg.id,
    item.id,
    readDeliveryPlatform(input.platform),
    status,
    publishedUrl,
    input.publishedAt ?? (status === "published" ? now : null),
    (input.note ?? "").trim().slice(0, 1_000),
    now,
    now,
  )
  return getPublishRecord(db, id)!
}

export function getPublishRecord(
  db: DatabaseSync,
  id: string,
): PublishRecord | null {
  const row = db.prepare(
    "SELECT * FROM video_publish_records WHERE id = ?",
  ).get(id) as PublishRecordRow | undefined
  return row ? toRecord(row) : null
}

export function listPublishRecords(
  db: DatabaseSync,
  packageId: string,
): PublishRecord[] {
  return (db.prepare(
    "SELECT * FROM video_publish_records WHERE package_id = ? ORDER BY created_at DESC",
  ).all(packageId) as PublishRecordRow[]).map(toRecord)
}

export function updatePublishRecord(
  db: DatabaseSync,
  packageId: string,
  id: string,
  input: {
    status?: PublishRecordStatus
    publishedUrl?: string
    publishedAt?: number | null
    note?: string
  },
): PublishRecord {
  const existing = getPublishRecord(db, id)
  if (!existing || existing.packageId !== packageId) throw new InputError("发布记录不存在")
  const status = input.status ?? existing.status
  const publishedUrl = (input.publishedUrl ?? existing.publishedUrl).trim().slice(0, 2_000)
  if (status === "published" && !/^https?:\/\//i.test(publishedUrl)) {
    throw new InputError("已发布记录必须填写有效的作品链接")
  }
  db.prepare(
    `UPDATE video_publish_records
     SET status = ?, published_url = ?, published_at = ?, note = ?, updated_at = ?
     WHERE id = ? AND package_id = ?`,
  ).run(
    status,
    publishedUrl,
    input.publishedAt === undefined ? existing.publishedAt : input.publishedAt,
    (input.note ?? existing.note).trim().slice(0, 1_000),
    Date.now(),
    id,
    packageId,
  )
  return getPublishRecord(db, id)!
}

export function addPublishMetric(
  db: DatabaseSync,
  input: {
    publishRecordId: string
    capturedAt?: number
    views?: number
    views3s?: number
    completionRate?: number
    likes?: number
    comments?: number
    shares?: number
    costUnits?: number
  },
): PublishMetric {
  const record = getPublishRecord(db, input.publishRecordId)
  if (!record) throw new InputError("发布记录不存在")
  const safe = (value: number | undefined) => Math.max(0, Math.floor(Number(value) || 0))
  const views = safe(input.views)
  const views3s = Math.min(views, safe(input.views3s))
  const row: PublishMetricRow = {
    id: randomUUID(),
    publish_record_id: record.id,
    captured_at: Math.max(0, Math.floor(input.capturedAt ?? Date.now())),
    views,
    views_3s: views3s,
    completion_rate: Math.max(0, Math.min(1, Number(input.completionRate) || 0)),
    likes: safe(input.likes),
    comments: safe(input.comments),
    shares: safe(input.shares),
    cost_units: safe(input.costUnits),
  }
  db.prepare(
    `INSERT INTO video_publish_metrics
      (id, publish_record_id, captured_at, views, views_3s, completion_rate,
       likes, comments, shares, cost_units)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id, row.publish_record_id, row.captured_at, row.views, row.views_3s,
    row.completion_rate, row.likes, row.comments, row.shares, row.cost_units,
  )
  return toMetric(row)
}

export function listLatestPublishMetrics(
  db: DatabaseSync,
  packageId: string,
): PublishMetric[] {
  return (db.prepare(
    `SELECT metrics.*
     FROM video_publish_metrics metrics
     JOIN video_publish_records records ON records.id = metrics.publish_record_id
     JOIN (
       SELECT publish_record_id, MAX(captured_at) AS latest_at
       FROM video_publish_metrics
       GROUP BY publish_record_id
     ) latest
       ON latest.publish_record_id = metrics.publish_record_id
      AND latest.latest_at = metrics.captured_at
     WHERE records.package_id = ?
     ORDER BY records.created_at DESC`,
  ).all(packageId) as PublishMetricRow[]).map(toMetric)
}

export function getPublishSummary(
  db: DatabaseSync,
  packageId: string,
): {
  publishedItems: number
  totalViews: number
  weightedRetention3s: number
  completionRate: number
  totalCostUnits: number
  costPerThousandViews: number
} {
  const published = db.prepare(
    "SELECT COUNT(DISTINCT item_id) AS n FROM video_publish_records WHERE package_id = ? AND status = 'published'",
  ).get(packageId) as { n: number }
  const metrics = listLatestPublishMetrics(db, packageId)
  const totalViews = metrics.reduce((sum, metric) => sum + metric.views, 0)
  const views3s = metrics.reduce((sum, metric) => sum + metric.views3s, 0)
  const completionWeighted = metrics.reduce(
    (sum, metric) => sum + metric.completionRate * metric.views,
    0,
  )
  const totalCostUnits = metrics.reduce((sum, metric) => sum + metric.costUnits, 0)
  return {
    publishedItems: Number(published.n),
    totalViews,
    weightedRetention3s: totalViews > 0 ? views3s / totalViews : 0,
    completionRate: totalViews > 0 ? completionWeighted / totalViews : 0,
    totalCostUnits,
    costPerThousandViews: totalViews > 0 ? totalCostUnits / (totalViews / 1_000) : 0,
  }
}
