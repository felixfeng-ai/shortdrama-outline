import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { getProject, getSnapshot } from "../assets/repo.ts"

export interface LocalizationBranch {
  id: string
  projectId: string
  ownerId: string
  name: string
  branchType: "localization"
  locale: string
  market: string
  sourceLanguage: string
  status: "active" | "archived"
  parentBranchId: string | null
  baseSnapshotId: string
  note: string
  createdAt: number
  updatedAt: number
}

interface BranchRow {
  id: string
  project_id: string
  owner_id: string
  name: string
  branch_type: string
  locale: string
  market: string
  source_language: string
  status: string
  parent_branch_id: string | null
  base_snapshot_id: string
  note: string
  created_at: number
  updated_at: number
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function branchRow(row: BranchRow): LocalizationBranch {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    name: row.name,
    branchType: "localization",
    locale: row.locale,
    market: row.market,
    sourceLanguage: row.source_language || "zh-CN",
    status: row.status === "archived" ? "archived" : "active",
    parentBranchId: row.parent_branch_id,
    baseSnapshotId: row.base_snapshot_id,
    note: row.note,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function requireProject(db: DatabaseSync, projectId: string, ownerId: string): void {
  if (!getProject(db, projectId, ownerId)) {
    const error = new Error("项目不存在或无权访问") as Error & { status: number }
    error.status = 403
    throw error
  }
}

/**
 * 创建海外分支只保存基线和市场身份，不复制快照正文。
 * 后续本地化产生的快照通过 branch_id 写入，从而与原始版本保持同一项目血缘。
 */
export function createLocalizationBranch(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  input: {
    name?: unknown
    baseSnapshotId?: unknown
    market?: unknown
    locale?: unknown
    sourceLanguage?: unknown
    parentBranchId?: unknown
    note?: unknown
  },
  now = Date.now(),
): LocalizationBranch {
  requireProject(db, projectId, ownerId)
  const name = text(input.name, 120)
  const baseSnapshotId = text(input.baseSnapshotId, 160)
  const market = text(input.market, 40)
  const locale = text(input.locale, 40)
  const sourceLanguage = text(input.sourceLanguage, 40) || "zh-CN"
  if (!name) throw new InputError("分支名称不能为空")
  if (!market) throw new InputError("目标市场不能为空")
  if (!locale) throw new InputError("目标语言不能为空")
  const snapshot = getSnapshot(db, baseSnapshotId)
  if (!snapshot || snapshot.projectId !== projectId) {
    throw new InputError("分支基线快照不存在")
  }
  const parentBranchId = text(input.parentBranchId, 160) || null
  const id = `branch_${randomUUID()}`
  db.prepare(
    `INSERT INTO project_branches
      (id, project_id, owner_id, name, base_snapshot_id, note, created_at, updated_at,
       branch_type, locale, market, source_language, status, parent_branch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'localization', ?, ?, ?, 'active', ?)`,
  ).run(
    id,
    projectId,
    ownerId,
    name,
    baseSnapshotId,
    text(input.note, 1_000),
    now,
    now,
    locale,
    market,
    sourceLanguage,
    parentBranchId,
  )
  return getLocalizationBranch(db, projectId, id, ownerId)!
}

export function getLocalizationBranch(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
): LocalizationBranch | null {
  const row = db.prepare(
    `SELECT * FROM project_branches
     WHERE id = ? AND project_id = ? AND owner_id = ?
       AND branch_type = 'localization'`,
  ).get(branchId, projectId, ownerId) as BranchRow | undefined
  return row ? branchRow(row) : null
}

export function listLocalizationBranches(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
): LocalizationBranch[] {
  requireProject(db, projectId, ownerId)
  return (db.prepare(
    `SELECT * FROM project_branches
     WHERE project_id = ? AND owner_id = ?
       AND branch_type = 'localization' AND status = 'active'
     ORDER BY updated_at DESC`,
  ).all(projectId, ownerId) as BranchRow[]).map(branchRow)
}
