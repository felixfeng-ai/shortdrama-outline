import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

interface StoryboardExportRow {
  id: string
  project_id: string
  status: "running" | "ready" | "failed"
  include_narration: number
  include_bgm: number
  bgm_track_id: string | null
  duration_ms: number
  narration_count: number
  video_storage_key: string | null
  srt_storage_key: string | null
  subtitle_mode: "burned" | "sidecar"
  warning: string | null
  error: string | null
  created_at: number
  updated_at: number
  finished_at: number | null
}

export interface StoryboardExportDto {
  id: string
  projectId: string
  status: "running" | "ready" | "failed"
  includeNarration: boolean
  includeBgm: boolean
  bgmTrackId: string | null
  durationMs: number
  narrationCount: number
  videoStorageKey: string | null
  srtStorageKey: string | null
  subtitleMode: "burned" | "sidecar"
  warning: string | null
  error: string | null
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

function toDto(row: StoryboardExportRow): StoryboardExportDto {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    includeNarration: row.include_narration === 1,
    includeBgm: row.include_bgm === 1,
    bgmTrackId: row.bgm_track_id,
    durationMs: row.duration_ms,
    narrationCount: row.narration_count,
    videoStorageKey: row.video_storage_key,
    srtStorageKey: row.srt_storage_key,
    subtitleMode: row.subtitle_mode,
    warning: row.warning,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  }
}

export function createStoryboardExport(
  db: DatabaseSync,
  projectId: string,
  options: { includeNarration: boolean; includeBgm: boolean },
): StoryboardExportDto {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(`
    INSERT INTO storyboard_exports
      (id, project_id, status, include_narration, include_bgm, created_at, updated_at)
    VALUES (?, ?, 'running', ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    options.includeNarration ? 1 : 0,
    options.includeBgm ? 1 : 0,
    now,
    now,
  )
  return getStoryboardExport(db, projectId, id)!
}

export function getStoryboardExport(
  db: DatabaseSync,
  projectId: string,
  exportId: string,
): StoryboardExportDto | null {
  const row = db.prepare(
    "SELECT * FROM storyboard_exports WHERE id = ? AND project_id = ?",
  ).get(exportId, projectId) as StoryboardExportRow | undefined
  return row ? toDto(row) : null
}

export function listStoryboardExports(
  db: DatabaseSync,
  projectId: string,
): StoryboardExportDto[] {
  const rows = db.prepare(
    "SELECT * FROM storyboard_exports WHERE project_id = ? ORDER BY created_at DESC",
  ).all(projectId) as StoryboardExportRow[]
  return rows.map(toDto)
}

export function completeStoryboardExport(
  db: DatabaseSync,
  projectId: string,
  exportId: string,
  input: {
    videoStorageKey: string
    srtStorageKey: string
    durationMs: number
    narrationCount: number
    bgmTrackId: string | null
    subtitleMode: "burned" | "sidecar"
    warning: string | null
  },
): StoryboardExportDto {
  const now = Date.now()
  db.prepare(`
    UPDATE storyboard_exports
    SET status = 'ready', video_storage_key = ?, srt_storage_key = ?,
        duration_ms = ?, narration_count = ?, bgm_track_id = ?,
        subtitle_mode = ?, warning = ?, error = NULL,
        updated_at = ?, finished_at = ?
    WHERE id = ? AND project_id = ?
  `).run(
    input.videoStorageKey,
    input.srtStorageKey,
    input.durationMs,
    input.narrationCount,
    input.bgmTrackId,
    input.subtitleMode,
    input.warning,
    now,
    now,
    exportId,
    projectId,
  )
  return getStoryboardExport(db, projectId, exportId)!
}

export function failStoryboardExport(
  db: DatabaseSync,
  projectId: string,
  exportId: string,
  error: string,
): StoryboardExportDto {
  const now = Date.now()
  db.prepare(`
    UPDATE storyboard_exports
    SET status = 'failed', error = ?, updated_at = ?, finished_at = ?
    WHERE id = ? AND project_id = ?
  `).run(error.trim().slice(0, 1_000) || "动态分镜导出失败", now, now, exportId, projectId)
  return getStoryboardExport(db, projectId, exportId)!
}
