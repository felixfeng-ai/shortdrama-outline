// 资产链的读写层：项目 / 快照 / 血缘。
//
// 与 SDD v0.2 §3、§4.1 对应：
//   - parents 取代原来的 JSON.stringify 指纹
//   - 版本号在同一 (project, kind) 下递增
//   - lineage 表保留边，供「影响范围」反查（阶段 2 用）
import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

export type ArtifactKind =
  | "idea" | "characters" | "acts" | "episodes"
  | "visualCharacters" | "scenes" | "shots"

export interface Project {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface Snapshot {
  id: string
  projectId: string
  kind: ArtifactKind
  version: number
  payload: unknown
  parents: string[]
  createdAt: number
}

interface ProjectRow { id: string; title: string; created_at: number; updated_at: number }
interface SnapshotRow {
  id: string; project_id: string; kind: string; version: number
  payload: string; created_at: number
}
interface ParentRow { to_snapshot_id: string }

function toProject(row: ProjectRow): Project {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }
}

function toSnapshot(row: SnapshotRow, parents: string[]): Snapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as ArtifactKind,
    version: row.version,
    payload: JSON.parse(row.payload),
    parents,
    createdAt: row.created_at,
  }
}

/** 新建项目 */
export function createProject(db: DatabaseSync, title: string): Project {
  const now = Date.now()
  const project: Project = { id: randomUUID(), title, createdAt: now, updatedAt: now }
  db.prepare("INSERT INTO projects (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(project.id, project.title, project.createdAt, project.updatedAt)
  return project
}

export function getProject(db: DatabaseSync, id: string): Project | null {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined
  return row ? toProject(row) : null
}

export function listProjects(db: DatabaseSync): Project[] {
  const rows = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as ProjectRow[]
  return rows.map(toProject)
}

/** 重命名项目。返回改名后的项目；id 不存在时返回 null（不抛） */
export function renameProject(db: DatabaseSync, id: string, title: string): Project | null {
  const name = title.trim()
  if (!name) return null
  const result = db
    .prepare("UPDATE projects SET title = ?, updated_at = ? WHERE id = ?")
    .run(name, Date.now(), id)
  if (result.changes === 0) return null
  return getProject(db, id)
}

/**
 * 删除项目。
 *
 * 快照、血缘、图台账三张表都是 `REFERENCES projects(id) ON DELETE CASCADE`，
 * 且连接时开了 `PRAGMA foreign_keys = ON`，所以删一行项目就能连带清干净——
 * 不需要在这里手写三条 DELETE，那反而容易漏（漏掉的孤儿快照会永远留在库里）。
 * 返回是否真的删掉了（id 不存在时 false）。
 */
export function deleteProject(db: DatabaseSync, id: string): boolean {
  const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id)
  return result.changes > 0
}

function readParents(db: DatabaseSync, snapshotId: string): string[] {
  const rows = db.prepare("SELECT to_snapshot_id FROM lineage WHERE from_snapshot_id = ? ORDER BY to_snapshot_id")
    .all(snapshotId) as ParentRow[]
  return rows.map((r) => r.to_snapshot_id)
}

/**
 * 写入一份快照。
 * 版本号由 (project_id, kind) 下的当前最大值 +1 得出，在同一进程内是安全的
 * （ecosystem.config.cjs 为单进程 fork，无并发写）。
 */
export function createSnapshot(
  db: DatabaseSync,
  input: { projectId: string; kind: ArtifactKind; payload: unknown; parents?: string[] },
): Snapshot {
  const parents = input.parents ?? []

  // 血缘边依赖外键约束：父快照必须真实存在，否则 SQLite 会直接拒绝
  const id = randomUUID()
  const now = Date.now()

  const row = db.prepare(
    "SELECT COALESCE(MAX(version), 0) AS v FROM snapshots WHERE project_id = ? AND kind = ?",
  ).get(input.projectId, input.kind) as { v: number }

  const version = row.v + 1

  db.prepare(
    "INSERT INTO snapshots (id, project_id, kind, version, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, input.projectId, input.kind, version, JSON.stringify(input.payload), now)

  const link = db.prepare("INSERT INTO lineage (from_snapshot_id, to_snapshot_id) VALUES (?, ?)")
  for (const parent of parents) link.run(id, parent)

  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now, input.projectId)

  return { id, projectId: input.projectId, kind: input.kind, version, payload: input.payload, parents, createdAt: now }
}

export function getSnapshot(db: DatabaseSync, id: string): Snapshot | null {
  const row = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(id) as SnapshotRow | undefined
  return row ? toSnapshot(row, readParents(db, id)) : null
}

/** 按 version 倒序列出某个 kind 的全部快照 */
export function listSnapshots(db: DatabaseSync, projectId: string, kind: ArtifactKind): Snapshot[] {
  const rows = db.prepare(
    "SELECT * FROM snapshots WHERE project_id = ? AND kind = ? ORDER BY version DESC",
  ).all(projectId, kind) as SnapshotRow[]
  return rows.map((row) => toSnapshot(row, readParents(db, row.id)))
}

/** 某个 kind 的最新一版（没有则 null） */
export function latestSnapshot(db: DatabaseSync, projectId: string, kind: ArtifactKind): Snapshot | null {
  return listSnapshots(db, projectId, kind)[0] ?? null
}
