import { createHash, randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"

export const MAX_PROJECT_MATERIAL_CHARS = 200_000
export const MAX_PROJECT_MATERIAL_INPUT_BYTES = 2 * 1024 * 1024
export const MAX_PROJECT_MATERIALS = 30

export type ProjectMaterialKind = "novel" | "script" | "notes"

export interface ProjectMaterial {
  id: string
  projectId: string
  name: string
  kind: ProjectMaterialKind
  mime: string
  bytes: number
  contentHash: string
  content: string
  characterCount: number
  chunkCount?: number
  truncated: boolean
  createdBy: string
  createdAt: number
  updatedAt: number
}

export interface SavedProjectMaterial extends ProjectMaterial {
  deduped: boolean
}

interface ProjectMaterialRow {
  id: string
  project_id: string
  name: string
  kind: string
  mime: string
  bytes: number
  content_hash: string
  content: string
  character_count: number
  truncated: number
  created_by: string
  created_at: number
  updated_at: number
}

function rowToMaterial(row: ProjectMaterialRow): ProjectMaterial {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    kind: row.kind === "novel" || row.kind === "script" ? row.kind : "notes",
    mime: row.mime,
    bytes: Number(row.bytes),
    contentHash: row.content_hash,
    content: row.content,
    characterCount: Number(row.character_count),
    truncated: Boolean(row.truncated),
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function inferMaterialKind(name: string, content: string): ProjectMaterialKind {
  if (/剧本|场次|第一场|内景|外景|INT\.|EXT\./i.test(`${name}\n${content}`)) return "script"
  if (/小说|原著|第[一二三四五六七八九十百千万\d]+章/i.test(`${name}\n${content}`)) return "novel"
  return "notes"
}

function normalizedContent(content: string): {
  content: string
  characterCount: number
  truncated: boolean
} {
  const normalized = content.replace(/\r\n?/g, "\n").trim()
  const characters = Array.from(normalized)
  return {
    content: characters.slice(0, MAX_PROJECT_MATERIAL_CHARS).join(""),
    characterCount: Math.min(characters.length, MAX_PROJECT_MATERIAL_CHARS),
    truncated: characters.length > MAX_PROJECT_MATERIAL_CHARS,
  }
}

export function saveProjectMaterial(
  db: DatabaseSync,
  input: {
    projectId: string
    ownerId: string
    name: string
    mime?: string
    bytes?: number
    kind?: ProjectMaterialKind
    content: string
  },
  now = Date.now(),
): SavedProjectMaterial {
  const name = input.name.trim().slice(0, 160)
  if (!name) throw new InputError("缺少素材名称")
  const normalized = normalizedContent(input.content)
  if (!normalized.content) throw new InputError("素材正文为空")

  const contentHash = createHash("sha256").update(normalized.content).digest("hex")
  const existing = db.prepare(
    "SELECT * FROM project_materials WHERE project_id = ? AND content_hash = ?",
  ).get(input.projectId, contentHash) as ProjectMaterialRow | undefined
  if (existing) {
    return { ...rowToMaterial(existing), deduped: true }
  }
  const count = db.prepare(
    "SELECT COUNT(*) AS n FROM project_materials WHERE project_id = ?",
  ).get(input.projectId) as { n: number }
  if (Number(count.n) >= MAX_PROJECT_MATERIALS) {
    throw new InputError(`单个项目最多保留 ${MAX_PROJECT_MATERIALS} 份原文`)
  }

  const id = randomUUID()
  const kind = input.kind ?? inferMaterialKind(name, normalized.content)
  const mime = input.mime?.trim().slice(0, 120) || "text/plain"
  const bytes = Math.max(
    1,
    Math.min(
      MAX_PROJECT_MATERIAL_INPUT_BYTES,
      Number.isFinite(input.bytes) ? Math.floor(Number(input.bytes)) : Buffer.byteLength(normalized.content),
    ),
  )
  db.prepare(
    `INSERT INTO project_materials
      (id, project_id, name, kind, mime, bytes, content_hash, content,
       character_count, truncated, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.projectId,
    name,
    kind,
    mime,
    bytes,
    contentHash,
    normalized.content,
    normalized.characterCount,
    normalized.truncated ? 1 : 0,
    input.ownerId,
    now,
    now,
  )
  const created = db.prepare("SELECT * FROM project_materials WHERE id = ?")
    .get(id) as ProjectMaterialRow
  return { ...rowToMaterial(created), deduped: false }
}

export function listProjectMaterials(
  db: DatabaseSync,
  projectId: string,
): ProjectMaterial[] {
  const rows = db.prepare(
    "SELECT * FROM project_materials WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC",
  ).all(projectId) as ProjectMaterialRow[]
  return rows.map(rowToMaterial)
}

export function deleteProjectMaterial(
  db: DatabaseSync,
  projectId: string,
  id: string,
): boolean {
  const result = db.prepare(
    "DELETE FROM project_materials WHERE project_id = ? AND id = ?",
  ).run(projectId, id)
  return Number(result.changes) > 0
}
