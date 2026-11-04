import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { ARTIFACT_KINDS, type ArtifactKind } from "../assets/types.ts"
import { createSnapshot, getProject, listSnapshots } from "../assets/repo.ts"
import { listLocalizationBranches } from "./branches.ts"
import {
  createBranchCanonFact,
  getBranchCanon,
  getBranchContext,
  listGlossary,
  upsertGlossaryEntry,
  type BranchCanonFact,
  type BranchContext,
  type GlossaryEntry,
} from "./context.ts"
import type { LocalizationAuditReport } from "./audit.ts"
import {
  loadLocalizationRun,
  saveLocalizationRun,
  type LocalizationRun,
} from "./runs.ts"

export interface ExportedLocalizationBranch {
  id: string
  name: string
  locale: string
  market: string
  sourceLanguage: string
  status: string
  baseSnapshotId: string
  parentBranchId: string | null
  note: string
  createdAt: number
  updatedAt: number
}

export interface ExportedLocalizationSnapshot {
  id: string
  branchId: string
  kind: ArtifactKind
  version: number
  payload: unknown
  parents: string[]
  createdAt: number
}

export interface ExportedLocalizationAudit {
  id: string
  branchId: string
  sourceSnapshotId: string
  report: LocalizationAuditReport
  createdAt: number
}

export interface LocalizationBackupData {
  schema: "chengju.localization-backup"
  schemaVersion: 1
  branches: ExportedLocalizationBranch[]
  contexts: BranchContext[]
  glossary: Array<GlossaryEntry & { branchId: string }>
  canonFacts: Array<BranchCanonFact & { branchId: string }>
  audits: ExportedLocalizationAudit[]
  runs: LocalizationRun[]
  snapshots: ExportedLocalizationSnapshot[]
}

interface AuditExportRow {
  id: string
  branch_id: string
  source_snapshot_id: string
  report_json: string
  created_at: number
}

export function exportLocalizationBackup(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
): LocalizationBackupData {
  const branches = listLocalizationBranches(db, projectId, ownerId)
  const contexts: BranchContext[] = []
  const glossary: Array<GlossaryEntry & { branchId: string }> = []
  const canonFacts: Array<BranchCanonFact & { branchId: string }> = []
  const audits: ExportedLocalizationAudit[] = []
  const runs: LocalizationRun[] = []
  const snapshots: ExportedLocalizationSnapshot[] = []

  for (const branch of branches) {
    const context = getBranchContext(db, projectId, branch.id, ownerId)
    if (context) contexts.push(context)
    glossary.push(...listGlossary(db, projectId, branch.id, ownerId))
    canonFacts.push(...getBranchCanon(db, projectId, branch.id, ownerId).facts)

    const auditRows = db.prepare(
      `SELECT id, branch_id, source_snapshot_id, report_json, created_at
       FROM localization_audits
       WHERE project_id = ? AND branch_id = ? AND owner_id = ?
       ORDER BY created_at ASC`,
    ).all(projectId, branch.id, ownerId) as AuditExportRow[]
    for (const row of auditRows) {
      try {
        audits.push({
          id: row.id,
          branchId: row.branch_id,
          sourceSnapshotId: row.source_snapshot_id,
          report: JSON.parse(row.report_json) as LocalizationAuditReport,
          createdAt: Number(row.created_at),
        })
      } catch {
        // 单条审计损坏不影响其它本地化资产导出。
      }
    }

    const runRows = db.prepare(
      `SELECT signature FROM localization_runs
       WHERE project_id = ? AND branch_id = ? AND owner_id = ?
       ORDER BY updated_at ASC`,
    ).all(projectId, branch.id, ownerId) as Array<{ signature: string }>
    for (const row of runRows) {
      const run = loadLocalizationRun(db, projectId, branch.id, row.signature)
      if (run) runs.push(run)
    }

    for (const kind of ARTIFACT_KINDS) {
      for (const snapshot of listSnapshots(db, projectId, kind, branch.id)) {
        snapshots.push({
          id: snapshot.id,
          branchId: branch.id,
          kind,
          version: snapshot.version,
          payload: snapshot.payload,
          parents: snapshot.parents,
          createdAt: snapshot.createdAt,
        })
      }
    }
  }

  return {
    schema: "chengju.localization-backup",
    schemaVersion: 1,
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      locale: branch.locale,
      market: branch.market,
      sourceLanguage: branch.sourceLanguage,
      status: branch.status,
      baseSnapshotId: branch.baseSnapshotId,
      parentBranchId: branch.parentBranchId,
      note: branch.note,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    })),
    contexts,
    glossary,
    canonFacts,
    audits,
    runs,
    snapshots,
  }
}

function insertBranch(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  branch: ExportedLocalizationBranch,
  id: string,
  baseSnapshotId: string,
  parentBranchId: string | null,
): void {
  db.prepare(
    `INSERT INTO project_branches
      (id, project_id, owner_id, name, base_snapshot_id, note, created_at, updated_at,
       branch_type, locale, market, source_language, status, parent_branch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'localization', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    ownerId,
    branch.name,
    baseSnapshotId,
    branch.note,
    branch.createdAt,
    branch.updatedAt,
    branch.locale,
    branch.market,
    branch.sourceLanguage,
    branch.status,
    parentBranchId,
  )
}

/**
 * 恢复顺序必须是：分支 -> 分支快照 -> Context/术语/Canon/审计。
 * 每个父子引用都通过 map 换新 id；失败由调用方的项目事务/清理逻辑兜底。
 */
export function restoreLocalizationBackup(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  data: LocalizationBackupData | null | undefined,
  options: {
    sourceSnapshotId?: string
    sourceSnapshotMap?: Map<string, string>
  } = {},
): {
  branches: number
  snapshots: number
  branchIdMap: Map<string, string>
} {
  if (!getProject(db, projectId, ownerId)) throw new InputError("恢复目标项目不存在")
  if (!data || data.schema !== "chengju.localization-backup") {
    return { branches: 0, snapshots: 0, branchIdMap: new Map() }
  }
  const branchIdMap = new Map<string, string>()
  const snapshotIdMap = new Map(options.sourceSnapshotMap ?? [])
  const fallbackBase = options.sourceSnapshotId ?? [...snapshotIdMap.values()][0] ?? ""
  for (const branch of data.branches ?? []) {
    const newId = `branch_${randomUUID()}`
    branchIdMap.set(branch.id, newId)
  }
  for (const branch of data.branches ?? []) {
    const baseSnapshotId = snapshotIdMap.get(branch.baseSnapshotId) ?? fallbackBase
    if (!baseSnapshotId) throw new InputError("海外分支缺少可恢复的基线快照")
    insertBranch(
      db,
      projectId,
      ownerId,
      branch,
      branchIdMap.get(branch.id)!,
      baseSnapshotId,
      branch.parentBranchId ? branchIdMap.get(branch.parentBranchId) ?? null : null,
    )
  }

  let restoredSnapshots = 0
  const orderedSnapshots = (data.snapshots ?? []).slice().sort((left, right) => {
    const kind = ARTIFACT_KINDS.indexOf(left.kind) - ARTIFACT_KINDS.indexOf(right.kind)
    return kind !== 0 ? kind : left.version - right.version
  })
  for (const snapshot of orderedSnapshots) {
    const branchId = branchIdMap.get(snapshot.branchId)
    if (!branchId) continue
    const parents = snapshot.parents
      .map((id) => snapshotIdMap.get(id))
      .filter((id): id is string => Boolean(id))
    const created = createSnapshot(db, {
      projectId,
      branchId,
      kind: snapshot.kind,
      payload: snapshot.payload,
      parents,
    })
    snapshotIdMap.set(snapshot.id, created.id)
    restoredSnapshots += 1
  }

  for (const context of data.contexts ?? []) {
    const branchId = branchIdMap.get(context.branchId)
    if (!branchId) continue
    db.prepare(
      `INSERT OR REPLACE INTO project_branch_context
        (branch_id, project_id, market_code, platforms_json, content_rating,
         adaptation_json, subtitle_json, notes, version, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      branchId,
      projectId,
      context.marketCode,
      JSON.stringify(context.platforms),
      context.contentRating,
      JSON.stringify(context.adaptationBrief),
      JSON.stringify(context.subtitle),
      context.notes,
      context.version,
      ownerId,
      context.updatedAt,
    )
  }
  for (const entry of data.glossary ?? []) {
    const branchId = branchIdMap.get(entry.branchId)
    if (!branchId) continue
    upsertGlossaryEntry(db, projectId, branchId, ownerId, {
      source: entry.source,
      target: entry.target,
      kind: entry.kind,
      locked: entry.locked,
      caseSensitive: entry.caseSensitive,
      notes: entry.notes,
    }, entry.updatedAt)
  }
  for (const fact of data.canonFacts ?? []) {
    const branchId = branchIdMap.get(fact.branchId)
    if (!branchId) continue
    createBranchCanonFact(db, projectId, branchId, ownerId, {
      kind: fact.entityKind,
      name: fact.entityName,
      field: fact.field,
      value: fact.value,
      validFromEpisode: fact.validFromEpisode,
      validToEpisode: fact.validToEpisode,
      sourceSnapshotId: fact.sourceSnapshotId
        ? snapshotIdMap.get(fact.sourceSnapshotId)
        : undefined,
      locked: fact.locked,
    }, fact.updatedAt)
  }
  for (const audit of data.audits ?? []) {
    const branchId = branchIdMap.get(audit.branchId)
    const sourceSnapshotId = snapshotIdMap.get(audit.sourceSnapshotId)
    if (!branchId || !sourceSnapshotId) continue
    db.prepare(
      `INSERT INTO localization_audits
        (id, project_id, branch_id, owner_id, source_snapshot_id,
         report_json, blocking, warnings, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `audit_${randomUUID()}`,
      projectId,
      branchId,
      ownerId,
      sourceSnapshotId,
      JSON.stringify({
        ...audit.report,
        projectId,
        branchId,
      }),
      audit.report.blocking,
      audit.report.warning,
      audit.createdAt,
    )
  }
  for (const run of data.runs ?? []) {
    const branchId = branchIdMap.get(run.branchId)
    const sourceSnapshotId = snapshotIdMap.get(run.sourceSnapshotId)
    if (!branchId || !sourceSnapshotId) continue
    saveLocalizationRun(db, {
      id: `localization_run_${randomUUID()}`,
      projectId,
      branchId,
      ownerId,
      sourceSnapshotId,
      signature: run.signature,
      cursor: run.cursor,
      state: run.state,
      status: run.status,
    }, run.updatedAt)
  }

  return {
    branches: branchIdMap.size,
    snapshots: restoredSnapshots,
    branchIdMap,
  }
}
