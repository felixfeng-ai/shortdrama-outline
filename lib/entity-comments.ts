import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "./api.ts"
import { getProject, latestSnapshot } from "./assets/repo.ts"
import type { ArtifactKind } from "./assets/types.ts"

export const ENTITY_COMMENT_TARGETS = ["character", "place", "episode", "shot"] as const
export type EntityCommentTarget = (typeof ENTITY_COMMENT_TARGETS)[number]
export type EntityCommentStatus = "open" | "resolved"

export interface EntityComment {
  id: string
  projectId: string
  targetType: EntityCommentTarget
  targetId: string
  targetName: string
  body: string
  status: EntityCommentStatus
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
  const id = `comment_${randomUUID()}`
  db.prepare(
    `INSERT INTO entity_comments
      (id, project_id, target_type, target_id, target_name, body, status,
       author_id, created_at, updated_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, NULL)`,
  ).run(id, projectId, target.type, target.id, target.name, body, ownerId, now, now)
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
  input: { status?: unknown; body?: unknown },
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
  db.prepare(
    `UPDATE entity_comments
     SET body = ?, status = ?, updated_at = ?, resolved_at = ?
     WHERE id = ? AND project_id = ?`,
  ).run(nextBody, nextStatus, now, resolvedAt, commentId, projectId)
  return commentRow(db.prepare("SELECT * FROM entity_comments WHERE id = ?").get(commentId) as CommentRow)
}
