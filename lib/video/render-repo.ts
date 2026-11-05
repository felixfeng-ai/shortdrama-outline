import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

import type { VideoRender, VideoRenderStatus } from "./render-types.ts"

interface VideoRenderRow {
  id: string
  project_id: string
  episode: number
  timeline_version_id: string
  timeline_revision: number
  status: string
  progress: number
  error: string | null
  duration_ms: number | null
  video_storage_key: string | null
  srt_storage_key: string | null
  manifest_storage_key: string | null
  created_at: number
  started_at: number | null
  finished_at: number | null
  updated_at: number
}

function toVideoRender(row: VideoRenderRow): VideoRender {
  return {
    id: row.id,
    projectId: row.project_id,
    episode: row.episode,
    timelineVersionId: row.timeline_version_id,
    timelineRevision: row.timeline_revision,
    status: row.status as VideoRenderStatus,
    progress: row.progress,
    error: row.error,
    durationMs: row.duration_ms,
    videoStorageKey: row.video_storage_key,
    srtStorageKey: row.srt_storage_key,
    manifestStorageKey: row.manifest_storage_key,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  }
}

export function createVideoRender(
  db: DatabaseSync,
  input: {
    projectId: string
    episode: number
    timelineVersionId: string
    timelineRevision: number
  },
): VideoRender {
  // 同一版本已经排队或渲染中时复用现有任务，避免刷新页面重复占满队列。
  const active = db.prepare(
    `SELECT * FROM video_renders
     WHERE project_id = ? AND timeline_version_id = ? AND status IN ('queued', 'running')
     ORDER BY created_at DESC LIMIT 1`,
  ).get(input.projectId, input.timelineVersionId) as VideoRenderRow | undefined
  if (active) return toVideoRender(active)

  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO video_renders
      (id, project_id, episode, timeline_version_id, timeline_revision, status,
       progress, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
  ).run(
    id,
    input.projectId,
    Math.max(0, Math.floor(input.episode)),
    input.timelineVersionId,
    Math.max(0, Math.floor(input.timelineRevision)),
    now,
    now,
  )
  return getVideoRender(db, input.projectId, id)!
}

export function getVideoRender(
  db: DatabaseSync,
  projectId: string,
  id: string,
): VideoRender | null {
  const row = db.prepare(
    "SELECT * FROM video_renders WHERE id = ? AND project_id = ?",
  ).get(id, projectId) as VideoRenderRow | undefined
  return row ? toVideoRender(row) : null
}

export function listVideoRenders(
  db: DatabaseSync,
  projectId: string,
  episode?: number,
): VideoRender[] {
  const rows = typeof episode === "number"
    ? db.prepare(
      `SELECT * FROM video_renders
       WHERE project_id = ? AND episode = ?
       ORDER BY created_at DESC`,
    ).all(projectId, episode)
    : db.prepare(
      "SELECT * FROM video_renders WHERE project_id = ? ORDER BY created_at DESC",
    ).all(projectId)
  return (rows as VideoRenderRow[]).map(toVideoRender)
}

export function recoverInterruptedVideoRenders(db: DatabaseSync): number {
  const now = Date.now()
  const result = db.prepare(
    `UPDATE video_renders
     SET status = 'failed',
         error = '服务重启时渲染进程已中断，请重新加入队列',
         finished_at = ?,
         updated_at = ?
     WHERE status = 'running'`,
  ).run(now, now)
  return Number(result.changes)
}

export function claimNextVideoRender(db: DatabaseSync): VideoRender | null {
  db.exec("BEGIN IMMEDIATE")
  try {
    // 队列是单实例串行：只有当前没有 running 任务时，才领取最早的一条 queued。
    const running = db.prepare(
      "SELECT id FROM video_renders WHERE status = 'running' LIMIT 1",
    ).get() as { id: string } | undefined
    if (running) {
      db.exec("COMMIT")
      return null
    }
    const next = db.prepare(
      "SELECT * FROM video_renders WHERE status = 'queued' ORDER BY created_at ASC, rowid ASC LIMIT 1",
    ).get() as VideoRenderRow | undefined
    if (!next) {
      db.exec("COMMIT")
      return null
    }
    const now = Date.now()
    db.prepare(
      `UPDATE video_renders
       SET status = 'running', progress = 1, started_at = ?, updated_at = ?
       WHERE id = ? AND status = 'queued'`,
    ).run(now, now, next.id)
    db.exec("COMMIT")
    return getVideoRender(db, next.project_id, next.id)
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function updateVideoRenderProgress(
  db: DatabaseSync,
  id: string,
  progress: number,
): VideoRender {
  db.prepare(
    "UPDATE video_renders SET progress = ?, updated_at = ? WHERE id = ? AND status = 'running'",
  ).run(Math.max(1, Math.min(99, Math.floor(progress))), Date.now(), id)
  const row = db.prepare("SELECT * FROM video_renders WHERE id = ?").get(id) as
    | VideoRenderRow
    | undefined
  if (!row) throw new Error("渲染任务不存在")
  return toVideoRender(row)
}

export function completeVideoRender(
  db: DatabaseSync,
  id: string,
  input: {
    durationMs: number
    videoStorageKey: string
    srtStorageKey: string
    manifestStorageKey: string
  },
): VideoRender {
  const now = Date.now()
  db.prepare(
    `UPDATE video_renders
     SET status = 'succeeded', progress = 100, error = NULL, duration_ms = ?,
         video_storage_key = ?, srt_storage_key = ?, manifest_storage_key = ?,
         finished_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    Math.max(0, Math.floor(input.durationMs)),
    input.videoStorageKey,
    input.srtStorageKey,
    input.manifestStorageKey,
    now,
    now,
    id,
  )
  const row = db.prepare("SELECT * FROM video_renders WHERE id = ?").get(id) as
    | VideoRenderRow
    | undefined
  if (!row) throw new Error("渲染任务不存在")
  return toVideoRender(row)
}

export function failVideoRender(
  db: DatabaseSync,
  id: string,
  message: string,
): VideoRender {
  const now = Date.now()
  db.prepare(
    `UPDATE video_renders
     SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(message.trim().slice(0, 1_000) || "成片渲染失败", now, now, id)
  const row = db.prepare("SELECT * FROM video_renders WHERE id = ?").get(id) as
    | VideoRenderRow
    | undefined
  if (!row) throw new Error("渲染任务不存在")
  return toVideoRender(row)
}
