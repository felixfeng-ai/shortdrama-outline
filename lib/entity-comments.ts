import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "./api.ts"
import { getProject, latestSnapshot } from "./assets/repo.ts"
import type { ArtifactKind } from "./assets/types.ts"

export const ENTITY_COMMENT_TARGETS = ["character", "place", "episode", "shot"] as const
export type EntityCommentTarget = (typeof ENTITY_COMMENT_TARGETS)[number]
export type EntityCommentStatus = "open" | "resolved"
export const ENTITY_COMMENT_KINDS = ["comment", "reject", "take", "timecode", "final"] as const
export type EntityCommentKind = (typeof ENTITY_COMMENT_KINDS)[number]
export type ContinuityStatus = "not_checked" | "passed" | "issues"

export interface EntityComment {
  id: string
  projectId: string
  targetType: EntityCommentTarget
  targetId: string
  targetName: string
  body: string
  status: EntityCommentStatus
  kind: EntityCommentKind
  timecodeMs: number | null
  frameMarked: boolean
  isBest: boolean
  continuityStatus: ContinuityStatus
  continuitySummary: string
  continuityIssueCount: number
  authorId: string
  createdAt: number
  updatedAt: number
  resolvedAt: number | null
}

interface CommentRow {
  id: string
  project_id: string
  target_type: string
  target_id: string
  target_name: string
  body: string
  status: string
  kind: string
  timecode_ms: number | null
  frame_marked: number
  is_best: number
  continuity_status: string
  continuity_summary: string
  continuity_issue_count: number
  author_id: string
  created_at: number
  updated_at: number
  resolved_at: number | null
}

const TARGET_KIND: Record<EntityCommentTarget, ArtifactKind> = {
  character: "characters",
  place: "visualPlaces",
  episode: "episodes",
  shot: "shots",
}

function commentRow(row: CommentRow): EntityComment {
  return {
    id: row.id,
    projectId: row.project_id,
    targetType: row.target_type as EntityCommentTarget,
    targetId: row.target_id,
    targetName: row.target_name,
    body: row.body,
    status: row.status === "resolved" ? "resolved" : "open",
    kind: (ENTITY_COMMENT_KINDS as readonly string[]).includes(row.kind)
      ? row.kind as EntityCommentKind
      : "comment",
    timecodeMs: row.timecode_ms === null ? null : Math.max(0, Number(row.timecode_ms) || 0),
    frameMarked: row.frame_marked === 1,
    isBest: row.is_best === 1,
    continuityStatus: row.continuity_status === "passed" || row.continuity_status === "issues"
      ? row.continuity_status
      : "not_checked",
    continuitySummary: row.continuity_summary,
    continuityIssueCount: Math.max(0, Number(row.continuity_issue_count) || 0),
    authorId: row.author_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
  }
}

function text(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : ""
}

function parseTargetType(value: unknown): EntityCommentTarget {
  if (typeof value !== "string" || !(ENTITY_COMMENT_TARGETS as readonly string[]).includes(value)) {
    throw new InputError("评论实体类型不合法")
  }
  return value as EntityCommentTarget
}

function parseKind(value: unknown): EntityCommentKind {
  const kind = typeof value === "string" ? value.trim() : ""
  return (ENTITY_COMMENT_KINDS as readonly string[]).includes(kind)
    ? kind as EntityCommentKind
    : "comment"
}

function parseContinuityStatus(value: unknown): ContinuityStatus {
  return value === "passed" || value === "issues" ? value : "not_checked"
}

function optionalTimecode(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new InputError("批注时间码不合法")
  return Math.min(24 * 60 * 60 * 1_000, Math.max(0, Math.floor(parsed)))
}

function objectRecords(payload: unknown): Record<string, unknown>[] {
  return Array.isArray(payload)
    ? payload.filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : []
}

function recordMatches(targetType: EntityCommentTarget, record: Record<string, unknown>, targetId: string): boolean {
  if (targetType === "episode") {
    return String(record.id ?? "") === targetId
      || String(record.entityId ?? "") === targetId
      || String(record.number ?? "") === targetId
  }
  return String(record.id ?? "") === targetId || String(record.entityId ?? "") === targetId
}

function recordName(targetType: EntityCommentTarget, record: Record<string, unknown>, targetId: string): string {
  if (targetType === "episode") {
    const number = Number(record.number)
    const title = text(record.title, 120)
    return `第 ${number || targetId} 集${title ? ` · ${title}` : ""}`
  }
  return text(record.name, 120)
    || text(record.scene, 120)
    || text(record.entityId, 120)
    || targetId
}

/**
 * 在最新快照里核对实体是否存在。
 *
 * 只在当前项目的最新快照里找，避免评论挂到已经删除的实体；如果某个步骤还没保存，
 * 就明确拒绝，而不是让评论变成一个脱离对象的自由文本。
 */
export function resolveCommentTarget(
  db: DatabaseSync,
  projectId: string,
  targetTypeValue: unknown,
  targetIdValue: unknown,
): { type: EntityCommentTarget; id: string; name: string } {
  const targetType = parseTargetType(targetTypeValue)
  const targetId = text(targetIdValue, 160)
  if (!targetId) throw new InputError("评论实体 id 不能为空")
  const snapshot = latestSnapshot(db, projectId, TARGET_KIND[targetType])
  const record = snapshot
    ? objectRecords(snapshot.payload).find((item) => recordMatches(targetType, item, targetId))
    : undefined
  if (!record) throw new InputError("评论目标实体不存在")
  return {
    type: targetType,
    id: targetId,
    name: recordName(targetType, record, targetId),
  }
}

/**
 * 评论与实体校验必须在写库之前完成；不通过时不产生半条记录。
 */
export function createEntityComment(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  input: {
    targetType?: unknown
    targetId?: unknown
    body?: unknown
    kind?: unknown
    timecodeMs?: unknown
    frameMarked?: unknown
    isBest?: unknown
    continuityStatus?: unknown
    continuitySummary?: unknown
    continuityIssueCount?: unknown
  },
  now = Date.now(),
): EntityComment {
  if (!getProject(db, projectId, ownerId)) {
    const error = new Error("项目不存在或无权访问") as Error & { status: number }
    error.status = 403
    throw error
  }
  const body = text(input.body, 2_000)
  if (!body) throw new InputError("评论正文不能为空")
  const target = resolveCommentTarget(db, projectId, input.targetType, input.targetId)
  const kind = parseKind(input.kind)
  const timecodeMs = optionalTimecode(input.timecodeMs)
  const frameMarked = input.frameMarked === true && timecodeMs !== null ? 1 : 0
  const isBest = kind === "take" && input.isBest === true ? 1 : 0
  const continuityStatus = kind === "take"
    ? parseContinuityStatus(input.continuityStatus)
    : "not_checked"
  const continuitySummary = kind === "take" ? text(input.continuitySummary, 500) : ""
  const continuityIssueCount = kind === "take"
    ? Math.min(999, Math.max(0, Math.floor(Number(input.continuityIssueCount) || 0)))
    : 0
  const id = `comment_${randomUUID()}`
  db.exec("BEGIN IMMEDIATE")
  try {
    if (isBest) {
      db.prepare(
        `UPDATE entity_comments SET is_best = 0, updated_at = ?
         WHERE project_id = ? AND target_type = ? AND target_id = ?
           AND kind = 'take' AND is_best = 1`,
      ).run(now, projectId, target.type, target.id)
    }
    db.prepare(
      `INSERT INTO entity_comments
        (id, project_id, target_type, target_id, target_name, body, status,
         kind, timecode_ms, frame_marked, is_best, continuity_status, continuity_summary,
         continuity_issue_count, author_id, created_at, updated_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      id,
      projectId,
      target.type,
      target.id,
      target.name,
      body,
      kind,
      timecodeMs,
      frameMarked,
      isBest,
      continuityStatus,
      continuitySummary,
      continuityIssueCount,
      ownerId,
      now,
      now,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return commentRow(db.prepare("SELECT * FROM entity_comments WHERE id = ?").get(id) as CommentRow)
}

export function listEntityComments(
  db: DatabaseSync,
  projectId: string,
  input: { targetType?: EntityCommentTarget; targetId?: string } = {},
): EntityComment[] {
  const rows = input.targetType && input.targetId
    ? db.prepare(
      `SELECT * FROM entity_comments
       WHERE project_id = ? AND target_type = ? AND target_id = ?
       ORDER BY created_at DESC`,
    ).all(projectId, input.targetType, input.targetId)
    : db.prepare(
      `SELECT * FROM entity_comments
       WHERE project_id = ?
       ORDER BY created_at DESC`,
    ).all(projectId)
  return (rows as CommentRow[]).map(commentRow)
}

export function updateEntityComment(
  db: DatabaseSync,
  projectId: string,
  commentId: string,
  ownerId: string,
  input: { status?: unknown; body?: unknown; isBest?: unknown },
  now = Date.now(),
): EntityComment {
  if (!getProject(db, projectId, ownerId)) {
    const error = new Error("项目不存在或无权访问") as Error & { status: number }
    error.status = 403
    throw error
  }
  const current = db.prepare(
    "SELECT * FROM entity_comments WHERE id = ? AND project_id = ?",
  ).get(commentId, projectId) as CommentRow | undefined
  if (!current) throw new InputError("评论不存在")
  const nextStatus: EntityCommentStatus = input.status === "resolved"
    ? "resolved"
    : input.status === "open"
      ? "open"
      : current.status === "resolved" ? "resolved" : "open"
  const nextBody = input.body === undefined ? current.body : text(input.body, 2_000)
  if (!nextBody) throw new InputError("评论正文不能为空")
  const resolvedAt = nextStatus === "resolved" ? (current.resolved_at ?? now) : null
  const markBest = input.isBest === true && current.kind === "take"
  db.exec("BEGIN IMMEDIATE")
  try {
    if (markBest) {
      db.prepare(
        `UPDATE entity_comments SET is_best = 0, updated_at = ?
         WHERE project_id = ? AND target_type = ? AND target_id = ?
           AND kind = 'take' AND is_best = 1`,
      ).run(now, projectId, current.target_type, current.target_id)
    }
    db.prepare(
      `UPDATE entity_comments
       SET body = ?, status = ?, updated_at = ?, resolved_at = ?,
           is_best = CASE WHEN ? = 1 THEN 1 ELSE is_best END
       WHERE id = ? AND project_id = ?`,
    ).run(nextBody, nextStatus, now, resolvedAt, markBest ? 1 : 0, commentId, projectId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return commentRow(db.prepare("SELECT * FROM entity_comments WHERE id = ?").get(commentId) as CommentRow)
}
