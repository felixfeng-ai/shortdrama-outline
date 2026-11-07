import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import type { BgmTrack } from "./bgm-types.ts"
import { getSystemBgmTrack } from "./system-bgm.ts"

interface BgmRow {
  id: string
  project_id: string
  name: string
  storage_key: string
  mime: string
  bytes: number
  duration_ms: number | null
  sha256: string
  license_confirmed: number
  license_note: string
  created_at: number
}

function toTrack(row: BgmRow): BgmTrack {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    storageKey: row.storage_key,
    mime: row.mime,
    bytes: row.bytes,
    durationMs: row.duration_ms,
    sha256: row.sha256,
    licenseConfirmed: row.license_confirmed === 1,
    licenseNote: row.license_note,
    createdAt: row.created_at,
    sourceType: "upload",
    previewUrl: `/api/audio/bgm/${encodeURIComponent(row.id)}/file?projectId=${encodeURIComponent(row.project_id)}`,
    bpm: null,
    tags: [],
    mood: "",
    genre: "",
    licenseName: "用户确认授权",
    licenseUrl: null,
    attribution: "",
  }
}

export function listBgmTracks(db: DatabaseSync, projectId: string): BgmTrack[] {
  const rows = db.prepare(
    "SELECT * FROM project_bgm_tracks WHERE project_id = ? ORDER BY created_at DESC",
  ).all(projectId) as BgmRow[]
  return rows.map(toTrack)
}

export function getBgmTrack(
  db: DatabaseSync,
  projectId: string,
  id: string,
): BgmTrack | null {
  const row = db.prepare(
    "SELECT * FROM project_bgm_tracks WHERE project_id = ? AND id = ?",
  ).get(projectId, id) as BgmRow | undefined
  return row ? toTrack(row) : getSystemBgmTrack(id)
}

export function listBgmFavoriteIds(
  db: DatabaseSync,
  ownerId: string,
): string[] {
  return (db.prepare(
    "SELECT track_id FROM bgm_favorites WHERE owner_id = ? ORDER BY created_at DESC",
  ).all(ownerId) as { track_id: string }[]).map((row) => row.track_id)
}

export function setBgmFavorite(
  db: DatabaseSync,
  ownerId: string,
  trackId: string,
  favorite: boolean,
): string[] {
  if (!getSystemBgmTrack(trackId)) {
    throw new InputError("只能收藏系统曲库中的配乐")
  }
  if (favorite) {
    db.prepare(
      `INSERT INTO bgm_favorites (owner_id, track_id, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(owner_id, track_id) DO UPDATE SET created_at = excluded.created_at`,
    ).run(ownerId, trackId, Date.now())
  } else {
    db.prepare(
      "DELETE FROM bgm_favorites WHERE owner_id = ? AND track_id = ?",
    ).run(ownerId, trackId)
  }
  return listBgmFavoriteIds(db, ownerId)
}

export function saveBgmTrack(
  db: DatabaseSync,
  input: Omit<BgmTrack, "createdAt">,
): BgmTrack {
  // 授权确认不是可选的 UI 提示，而是写入曲库前必须满足的服务端约束。
  if (!input.licenseConfirmed) {
    throw new InputError("必须确认拥有该 BGM 的使用授权")
  }
  const name = input.name.trim().slice(0, 100)
  if (!name) throw new InputError("BGM 名称不能为空")
  if (!["audio/mpeg", "audio/wav", "audio/x-wav"].includes(input.mime)) {
    throw new InputError("只支持 MP3 或 WAV 格式的 BGM")
  }
  if (input.bytes <= 0 || input.bytes > 30 * 1024 * 1024) {
    throw new InputError("BGM 文件必须小于 30MB")
  }
  if (!input.sha256.trim()) throw new InputError("BGM 缺少文件指纹")
  const now = Date.now()
  db.prepare(
    `INSERT INTO project_bgm_tracks
      (id, project_id, name, storage_key, mime, bytes, duration_ms, sha256,
       license_confirmed, license_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    input.id,
    input.projectId,
    name,
    input.storageKey,
    input.mime,
    Math.floor(input.bytes),
    input.durationMs === null ? null : Math.max(0, Math.floor(input.durationMs)),
    input.sha256,
    input.licenseNote.trim().slice(0, 300),
    now,
  )
  return getBgmTrack(db, input.projectId, input.id)!
}

export function deleteBgmTrack(
  db: DatabaseSync,
  projectId: string,
  id: string,
): boolean {
  const result = db.prepare(
    "DELETE FROM project_bgm_tracks WHERE project_id = ? AND id = ?",
  ).run(projectId, id)
  return Number(result.changes) > 0
}
