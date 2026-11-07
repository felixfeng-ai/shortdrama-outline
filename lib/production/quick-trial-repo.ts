import type { DatabaseSync } from "node:sqlite"

import type {
  QuickTrialPhase,
  QuickTrialRunDto,
  QuickTrialRunStatus,
} from "./quick-trial.ts"

interface QuickTrialRunRow {
  project_id: string
  idea: string
  phase: QuickTrialPhase
  status: QuickTrialRunStatus
  error: string | null
  visual_approved: number
  created_at: number
  updated_at: number
}

function toRun(row: QuickTrialRunRow): QuickTrialRunDto {
  return {
    projectId: row.project_id,
    idea: row.idea,
    phase: row.phase,
    status: row.status,
    error: row.error,
    visualApproved: row.visual_approved === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Quick Trial Run 只保存流程位置，不复制任何创作产物。
 * 恢复时必须继续读取正式快照，避免形成第二套项目事实。
 */
export function getQuickTrialRun(
  db: DatabaseSync,
  projectId: string,
): QuickTrialRunDto | null {
  const row = db.prepare(
    "SELECT * FROM project_quick_trial_runs WHERE project_id = ?",
  ).get(projectId) as QuickTrialRunRow | undefined
  return row ? toRun(row) : null
}

export function upsertQuickTrialRun(
  db: DatabaseSync,
  input: {
    projectId: string
    idea: string
    phase: QuickTrialPhase
    status: QuickTrialRunStatus
    error?: string | null
    visualApproved?: boolean
  },
): QuickTrialRunDto {
  const now = Date.now()
  db.prepare(`
    INSERT INTO project_quick_trial_runs
      (project_id, idea, phase, status, error, visual_approved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      idea = excluded.idea,
      phase = excluded.phase,
      status = excluded.status,
      error = excluded.error,
      visual_approved = excluded.visual_approved,
      updated_at = excluded.updated_at
  `).run(
    input.projectId,
    input.idea,
    input.phase,
    input.status,
    input.error ?? null,
    input.visualApproved ? 1 : 0,
    now,
    now,
  )
  return getQuickTrialRun(db, input.projectId)!
}

export function updateQuickTrialRun(
  db: DatabaseSync,
  projectId: string,
  input: {
    phase?: QuickTrialPhase
    status?: QuickTrialRunStatus
    error?: string | null
    visualApproved?: boolean
  },
): QuickTrialRunDto | null {
  const current = getQuickTrialRun(db, projectId)
  if (!current) return null
  db.prepare(`
    UPDATE project_quick_trial_runs
    SET phase = ?, status = ?, error = ?, visual_approved = ?, updated_at = ?
    WHERE project_id = ?
  `).run(
    input.phase ?? current.phase,
    input.status ?? current.status,
    input.error === undefined ? current.error : input.error,
    input.visualApproved === undefined
      ? (current.visualApproved ? 1 : 0)
      : (input.visualApproved ? 1 : 0),
    Date.now(),
    projectId,
  )
  return getQuickTrialRun(db, projectId)
}
