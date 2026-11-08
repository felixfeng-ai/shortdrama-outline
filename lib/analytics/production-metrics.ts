import type { DatabaseSync } from "node:sqlite"

import type { QuickCreationTarget, QuickTrialRunStatus } from "../production/quick-trial.ts"

const STALE_ACTIVE_MS = 30 * 60 * 1000
const TARGETS: QuickCreationTarget[] = ["story", "keyframe", "video"]

export interface QuickTrialMetricRow {
  ownerId?: string
  projectId?: string
  target: QuickCreationTarget
  status: QuickTrialRunStatus
  createdAt: number
  updatedAt: number
}

interface MetricsInput {
  runs: QuickTrialMetricRow[]
  deliveryProjectIds: string[]
  publishedProjectIds: string[]
  now: number
}

interface DurationSummary {
  sampleSize: number
  p50: number | null
  p90: number | null
  max: number | null
}

interface TargetMetrics {
  total: number
  active: number
  completed: number
  failed: number
  staleActive: number
  completionRate: number | null
  firstResultMs: DurationSummary
}

export interface ProductionMetricsReport {
  generatedAt: number
  quickTrial: {
    counts: {
      total: number
      active: number
      completed: number
      failed: number
      staleActive: number
    }
    completionRate: number | null
    failureRate: number | null
    firstResultMs: DurationSummary
    byTarget: Record<QuickCreationTarget, TargetMetrics>
  }
  delivery: {
    projects: number
    withPackage: number
    withPublishedRecord: number
    packageRate: number | null
    publishRate: number | null
  }
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

function nearestRank(sorted: number[], percentile: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1)
  return sorted[index] ?? null
}

function durationSummary(runs: QuickTrialMetricRow[]): DurationSummary {
  const durations = runs
    .filter((run) => run.status === "completed")
    .map((run) => run.updatedAt - run.createdAt)
    .filter((duration) => Number.isFinite(duration) && duration >= 0)
    .sort((left, right) => left - right)

  return {
    sampleSize: durations.length,
    p50: nearestRank(durations, 0.5),
    p90: nearestRank(durations, 0.9),
    max: durations.at(-1) ?? null,
  }
}

function targetMetrics(runs: QuickTrialMetricRow[], now: number): TargetMetrics {
  const active = runs.filter((run) => run.status === "active")
  const completed = runs.filter((run) => run.status === "completed").length
  const failed = runs.filter((run) => run.status === "failed").length

  return {
    total: runs.length,
    active: active.length,
    completed,
    failed,
    staleActive: active.filter((run) => now - run.updatedAt > STALE_ACTIVE_MS).length,
    completionRate: ratio(completed, runs.length),
    firstResultMs: durationSummary(runs),
  }
}

export function buildProductionMetrics(input: MetricsInput): ProductionMetricsReport {
  const { runs, now } = input
  const completed = runs.filter((run) => run.status === "completed").length
  const failed = runs.filter((run) => run.status === "failed").length
  const projectIds = new Set(
    runs
      .map((run) => run.projectId)
      .filter((projectId): projectId is string => Boolean(projectId)),
  )
  const deliveryProjects = new Set(
    input.deliveryProjectIds.filter((projectId) => projectIds.has(projectId)),
  )
  const publishedProjects = new Set(
    input.publishedProjectIds.filter((projectId) => projectIds.has(projectId)),
  )

  return {
    generatedAt: now,
    quickTrial: {
      counts: {
        total: runs.length,
        active: runs.filter((run) => run.status === "active").length,
        completed,
        failed,
        staleActive: runs.filter(
          (run) => run.status === "active" && now - run.updatedAt > STALE_ACTIVE_MS,
        ).length,
      },
      completionRate: ratio(completed, runs.length),
      failureRate: ratio(failed, runs.length),
      firstResultMs: durationSummary(runs),
      byTarget: Object.fromEntries(
        TARGETS.map((target) => [
          target,
          targetMetrics(runs.filter((run) => run.target === target), now),
        ]),
      ) as Record<QuickCreationTarget, TargetMetrics>,
    },
    delivery: {
      projects: projectIds.size,
      withPackage: deliveryProjects.size,
      withPublishedRecord: publishedProjects.size,
      packageRate: ratio(deliveryProjects.size, projectIds.size),
      publishRate: ratio(publishedProjects.size, projectIds.size),
    },
  }
}

export function readProductionMetrics(
  db: DatabaseSync,
  now = Date.now(),
): ProductionMetricsReport {
  const runs = db.prepare(`
    SELECT project_id, target, status, created_at, updated_at
    FROM project_quick_trial_runs
  `).all() as Array<{
    project_id: string
    target: QuickCreationTarget
    status: QuickTrialRunStatus
    created_at: number
    updated_at: number
  }>
  const deliveryProjectIds = db.prepare(`
    SELECT DISTINCT project_id
    FROM video_delivery_packages
  `).all().map((row) => (row as { project_id: string }).project_id)
  const publishedProjectIds = db.prepare(`
    SELECT DISTINCT packages.project_id
    FROM video_publish_records records
    JOIN video_delivery_packages packages ON packages.id = records.package_id
  `).all().map((row) => (row as { project_id: string }).project_id)

  return buildProductionMetrics({
    runs: runs.map((row) => ({
      projectId: row.project_id,
      target: row.target,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    deliveryProjectIds,
    publishedProjectIds,
    now,
  })
}
