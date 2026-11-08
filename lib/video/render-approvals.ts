import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import type { VideoRenderApproval } from "./render-types.ts"

interface ApprovalRow {
  render_id: string
  project_id: string
  status: string
  note: string
  requested_at: number
  reviewed_at: number | null
  reviewer_label: string
}

function toApproval(row: ApprovalRow): VideoRenderApproval {
  return {
    renderId: row.render_id,
    projectId: row.project_id,
    status: row.status === "approved" || row.status === "changes_requested"
      ? row.status
      : "pending",
    note: row.note,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewerLabel: row.reviewer_label,
  }
}

export function getRenderApproval(
  db: DatabaseSync,
  projectId: string,
  renderId: string,
): VideoRenderApproval | null {
  const row = db.prepare(
    "SELECT * FROM video_render_approvals WHERE project_id = ? AND render_id = ?",
  ).get(projectId, renderId) as ApprovalRow | undefined
  return row ? toApproval(row) : null
}

export function listRenderApprovals(
  db: DatabaseSync,
  projectId: string,
  renderIds: string[],
): Map<string, VideoRenderApproval> {
  if (renderIds.length === 0) return new Map()
  const placeholders = renderIds.map(() => "?").join(",")
  const rows = db.prepare(
    `SELECT * FROM video_render_approvals
     WHERE project_id = ? AND render_id IN (${placeholders})`,
  ).all(projectId, ...renderIds) as ApprovalRow[]
  return new Map(rows.map((row) => [row.render_id, toApproval(row)]))
}

export function updateRenderApproval(
  db: DatabaseSync,
  input: {
    projectId: string
    renderId: string
    action: "request" | "approve" | "request_changes"
    note?: string
    reviewerLabel: string
  },
): VideoRenderApproval {
  const render = db.prepare(
    "SELECT status FROM video_renders WHERE id = ? AND project_id = ?",
  ).get(input.renderId, input.projectId) as { status: string } | undefined
  if (!render) throw new InputError("成片不存在或无权访问")
  if (render.status !== "succeeded") throw new InputError("只有已完成的成片可以提交审核")
  const now = Date.now()
  const existing = getRenderApproval(db, input.projectId, input.renderId)
  if (input.action === "request") {
    db.prepare(
      `INSERT INTO video_render_approvals
        (render_id, project_id, status, note, requested_at, reviewed_at, reviewer_label)
       VALUES (?, ?, 'pending', ?, ?, NULL, ?)
       ON CONFLICT(render_id) DO UPDATE SET
         status = 'pending',
         note = excluded.note,
         requested_at = excluded.requested_at,
         reviewed_at = NULL,
         reviewer_label = excluded.reviewer_label`,
    ).run(
      input.renderId,
      input.projectId,
      (input.note ?? "").trim().slice(0, 500),
      now,
      input.reviewerLabel,
    )
  } else {
    if (!existing) throw new InputError("请先提交交付审核")
    const status = input.action === "approve" ? "approved" : "changes_requested"
    db.prepare(
      `UPDATE video_render_approvals
       SET status = ?, note = ?, reviewed_at = ?, reviewer_label = ?
       WHERE project_id = ? AND render_id = ?`,
    ).run(
      status,
      (input.note ?? existing.note).trim().slice(0, 500),
      now,
      input.reviewerLabel,
      input.projectId,
      input.renderId,
    )
  }
  return getRenderApproval(db, input.projectId, input.renderId)!
}
