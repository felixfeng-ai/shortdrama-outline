import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

const TARGET_TYPES = ["project", "asset", "comment", "share"] as const
const REASONS = ["copyright", "illegal", "hate", "harassment", "privacy", "sexual", "other"] as const

export type ContentReportTarget = (typeof TARGET_TYPES)[number]
export type ContentReportReason = (typeof REASONS)[number]

export interface ContentReportInput {
  projectId: string
  targetType: ContentReportTarget
  targetId: string
  reason: ContentReportReason
  detail: string
}

export interface ContentReport extends ContentReportInput {
  id: string
  reporterId: string
  status: "pending" | "reviewing" | "resolved"
  createdAt: number
  updatedAt: number
}

export function readContentReport(value: unknown): ContentReportInput {
  if (!value || typeof value !== "object") throw new Error("举报内容格式不正确")
  const record = value as Record<string, unknown>
  const targetId = typeof record.targetId === "string" ? record.targetId.trim() : ""
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : ""
  const targetType = record.targetType
  const reason = record.reason
  if (!targetId) throw new Error("举报目标不完整")
  if (!TARGET_TYPES.includes(targetType as ContentReportTarget)) throw new Error("举报目标类型不正确")
  if (!REASONS.includes(reason as ContentReportReason)) throw new Error("举报原因不正确")
  if (!projectId) throw new Error("举报项目不完整")
  const detail = typeof record.detail === "string" ? record.detail.trim().slice(0, 1000) : ""
  return {
    projectId,
    targetType: targetType as ContentReportTarget,
    targetId,
    reason: reason as ContentReportReason,
    detail,
  }
}

function toReport(row: Record<string, unknown>): ContentReport {
  return {
    id: String(row.id),
    reporterId: String(row.reporter_id),
    projectId: String(row.project_id ?? ""),
    targetType: row.target_type as ContentReportTarget,
    targetId: String(row.target_id),
    reason: row.reason as ContentReportReason,
    detail: String(row.detail ?? ""),
    status: row.status as ContentReport["status"],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function createContentReport(
  db: DatabaseSync,
  reporterId: string,
  input: ContentReportInput,
  now = Date.now(),
): ContentReport {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO content_reports
      (id, reporter_id, project_id, target_type, target_id, reason, detail, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(id, reporterId, input.projectId, input.targetType, input.targetId, input.reason, input.detail, now, now)
  const row = db.prepare("SELECT * FROM content_reports WHERE id = ?").get(id) as Record<string, unknown>
  return toReport(row)
}

export function listContentReports(db: DatabaseSync, reporterId: string): ContentReport[] {
  const rows = db.prepare(
    "SELECT * FROM content_reports WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 50",
  ).all(reporterId) as Record<string, unknown>[]
  return rows.map(toReport)
}
