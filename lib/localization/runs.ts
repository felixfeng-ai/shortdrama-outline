import type { DatabaseSync } from "node:sqlite"

export interface LocalizationRun<T = unknown> {
  id: string
  projectId: string
  branchId: string
  ownerId: string
  sourceSnapshotId: string
  signature: string
  cursor: number
  state: T
  status: "running" | "done" | "failed"
  createdAt: number
  updatedAt: number
}

interface RunRow {
  id: string
  project_id: string
  branch_id: string
  owner_id: string
  source_snapshot_id: string
  signature: string
  cursor: number
  state_json: string
  status: string
  created_at: number
  updated_at: number
}

function runRow<T>(row: RunRow): LocalizationRun<T> {
  let state: T
  try {
    state = JSON.parse(row.state_json) as T
  } catch {
    state = {} as T
  }
  return {
    id: row.id,
    projectId: row.project_id,
    branchId: row.branch_id,
    ownerId: row.owner_id,
    sourceSnapshotId: row.source_snapshot_id,
    signature: row.signature,
    cursor: Number(row.cursor),
    state,
    status: row.status === "done" ? "done" : row.status === "failed" ? "failed" : "running",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function saveLocalizationRun<T>(
  db: DatabaseSync,
  input: Omit<LocalizationRun<T>, "createdAt" | "updatedAt" | "status"> & {
    status?: LocalizationRun<T>["status"]
  },
  now = Date.now(),
): LocalizationRun<T> {
  const status = input.status ?? "running"
  db.prepare(
    `INSERT INTO localization_runs
      (id, project_id, branch_id, owner_id, source_snapshot_id, signature,
       cursor, state_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, branch_id, signature) DO UPDATE SET
       cursor = excluded.cursor,
       state_json = excluded.state_json,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  ).run(
    input.id,
    input.projectId,
    input.branchId,
    input.ownerId,
    input.sourceSnapshotId,
    input.signature,
    Math.max(0, Math.floor(input.cursor)),
    JSON.stringify(input.state),
    status,
    now,
    now,
  )
  return loadLocalizationRun<T>(db, input.projectId, input.branchId, input.signature)!
}

export function loadLocalizationRun<T>(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  signature: string,
): LocalizationRun<T> | null {
  const row = db.prepare(
    `SELECT * FROM localization_runs
     WHERE project_id = ? AND branch_id = ? AND signature = ?`,
  ).get(projectId, branchId, signature) as RunRow | undefined
  return row ? runRow<T>(row) : null
}

export function clearLocalizationRun(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  signature: string,
): boolean {
  const result = db.prepare(
    `DELETE FROM localization_runs
     WHERE project_id = ? AND branch_id = ? AND signature = ?`,
  ).run(projectId, branchId, signature)
  return Number(result.changes) > 0
}
