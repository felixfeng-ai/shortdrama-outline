import type { DatabaseSync } from "node:sqlite"

import type {
  QuickCreationTarget,
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
  target: QuickCreationTarget
  budget_units: number
  budget_micros: number
  visual_approved: number
  video_approved: number
  video_budget_micros: number
  video_model: string | null
  video_resolution: string | null
  video_duration_seconds: number
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
    target: row.target,
    budgetUnits: row.budget_units,
    budgetMicros: row.budget_micros,
    visualApproved: row.visual_approved === 1,
    videoApproved: row.video_approved === 1,
    videoBudgetMicros: row.video_budget_micros,
    videoModel: row.video_model,
    videoResolution: row.video_resolution,
    videoDurationSeconds: row.video_duration_seconds,
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
    target?: QuickCreationTarget
    budgetUnits?: number
    budgetMicros?: number
    visualApproved?: boolean
    videoApproved?: boolean
    videoBudgetMicros?: number
    videoModel?: string | null
    videoResolution?: string | null
    videoDurationSeconds?: number
  },
): QuickTrialRunDto {
  const now = Date.now()
  db.prepare(`
    INSERT INTO project_quick_trial_runs
      (project_id, idea, phase, status, error, target, budget_units, budget_micros,
       visual_approved, video_approved, video_budget_micros, video_model,
       video_resolution, video_duration_seconds, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      idea = excluded.idea,
      phase = excluded.phase,
      status = excluded.status,
      error = excluded.error,
      target = excluded.target,
      budget_units = excluded.budget_units,
      budget_micros = excluded.budget_micros,
      visual_approved = excluded.visual_approved,
      video_approved = excluded.video_approved,
      video_budget_micros = excluded.video_budget_micros,
      video_model = excluded.video_model,
      video_resolution = excluded.video_resolution,
      video_duration_seconds = excluded.video_duration_seconds,
      updated_at = excluded.updated_at
  `).run(
    input.projectId,
    input.idea,
    input.phase,
    input.status,
    input.error ?? null,
    input.target ?? "keyframe",
    Math.max(0, Math.floor(input.budgetUnits ?? 0)),
    Math.max(0, Math.floor(input.budgetMicros ?? 0)),
    input.visualApproved ? 1 : 0,
    input.videoApproved ? 1 : 0,
    Math.max(0, Math.floor(input.videoBudgetMicros ?? 0)),
    input.videoModel ?? null,
    input.videoResolution ?? null,
    Math.max(1, Math.floor(input.videoDurationSeconds ?? 5)),
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
    target?: QuickCreationTarget
    budgetUnits?: number
    budgetMicros?: number
    visualApproved?: boolean
    videoApproved?: boolean
    videoBudgetMicros?: number
    videoModel?: string | null
    videoResolution?: string | null
    videoDurationSeconds?: number
  },
): QuickTrialRunDto | null {
  const current = getQuickTrialRun(db, projectId)
  if (!current) return null
  db.prepare(`
    UPDATE project_quick_trial_runs
    SET phase = ?, status = ?, error = ?, target = ?, budget_units = ?,
        budget_micros = ?, visual_approved = ?, video_approved = ?,
        video_budget_micros = ?, video_model = ?, video_resolution = ?,
        video_duration_seconds = ?, updated_at = ?
    WHERE project_id = ?
  `).run(
    input.phase ?? current.phase,
    input.status ?? current.status,
    input.error === undefined ? current.error : input.error,
    input.target ?? current.target,
    input.budgetUnits === undefined
      ? current.budgetUnits
      : Math.max(0, Math.floor(input.budgetUnits)),
    input.budgetMicros === undefined
      ? current.budgetMicros
      : Math.max(0, Math.floor(input.budgetMicros)),
    input.visualApproved === undefined
      ? (current.visualApproved ? 1 : 0)
      : (input.visualApproved ? 1 : 0),
    input.videoApproved === undefined
      ? (current.videoApproved ? 1 : 0)
      : (input.videoApproved ? 1 : 0),
    input.videoBudgetMicros === undefined
      ? current.videoBudgetMicros
      : Math.max(0, Math.floor(input.videoBudgetMicros)),
    input.videoModel === undefined ? current.videoModel : input.videoModel,
    input.videoResolution === undefined ? current.videoResolution : input.videoResolution,
    input.videoDurationSeconds === undefined
      ? current.videoDurationSeconds
      : Math.max(1, Math.floor(input.videoDurationSeconds)),
    Date.now(),
    projectId,
  )
  return getQuickTrialRun(db, projectId)
}
