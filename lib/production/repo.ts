// 生产计划持久化。所有计划都绑定项目，并由数据库外键级联清理。
import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { createProductionPlanSeed } from "./planner.ts"
import { normalizeProductionTarget } from "./presets.ts"
import { planProductionExtension } from "./promotion.ts"
import type {
  ProductionMode,
  ProductionPlanStatus,
  ProductionStage,
  ProductionStageKey,
  ProductionStageStatus,
  ProjectType,
} from "./types.ts"

export interface ProductionPlan {
  id: string
  projectId: string
  projectType: ProjectType
  mode: ProductionMode
  targetEpisodes: number
  currentStage: ProductionStageKey
  status: ProductionPlanStatus
  createdAt: number
  updatedAt: number
  stages: ProductionStage[]
}

export interface ProductionExtension {
  id: string
  planId: string
  fromMode: ProductionMode
  toMode: ProductionMode
  fromTargetEpisodes: number
  toTargetEpisodes: number
  existingEpisodeNumbers: number[]
  newEpisodeNumbers: number[]
  estimatedUnits: number
  createdAt: number
}

interface PlanRow {
  id: string
  project_id: string
  project_type: ProjectType
  mode: ProductionMode
  target_episodes: number
  current_stage: ProductionStageKey
  status: ProductionPlanStatus
  created_at: number
  updated_at: number
}

interface StageRow {
  stage_key: ProductionStageKey
  position: number
  status: ProductionStageStatus
  label: string
  description: string
}

interface ExtensionRow {
  id: string
  plan_id: string
  from_mode: ProductionMode
  to_mode: ProductionMode
  from_target_episodes: number
  to_target_episodes: number
  existing_episode_numbers: string
  new_episode_numbers: string
  estimated_units: number
  created_at: number
}

function readNumberList(value: string): number[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.map(Number).filter((item) => Number.isFinite(item))
      : []
  } catch {
    return []
  }
}

function toExtension(row: ExtensionRow): ProductionExtension {
  return {
    id: row.id,
    planId: row.plan_id,
    fromMode: row.from_mode,
    toMode: row.to_mode,
    fromTargetEpisodes: row.from_target_episodes,
    toTargetEpisodes: row.to_target_episodes,
    existingEpisodeNumbers: readNumberList(row.existing_episode_numbers),
    newEpisodeNumbers: readNumberList(row.new_episode_numbers),
    estimatedUnits: row.estimated_units,
    createdAt: row.created_at,
  }
}

function writeStages(
  db: DatabaseSync,
  planId: string,
  stages: ProductionStage[],
  now: number,
): void {
  const insert = db.prepare(`
    INSERT INTO production_stages
      (id, plan_id, stage_key, position, status, label, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const stage of stages) {
    insert.run(
      randomUUID(),
      planId,
      stage.key,
      stage.position,
      stage.status,
      stage.label,
      stage.description,
      now,
      now,
    )
  }
}

export function getProductionPlan(
  db: DatabaseSync,
  projectId: string,
): ProductionPlan | null {
  const row = db.prepare(
    "SELECT * FROM project_production_plans WHERE project_id = ?",
  ).get(projectId) as PlanRow | undefined
  if (!row) return null
  const stages = db.prepare(`
    SELECT stage_key, position, status, label, description
    FROM production_stages
    WHERE plan_id = ?
    ORDER BY position ASC
  `).all(row.id) as StageRow[]
  return {
    id: row.id,
    projectId: row.project_id,
    projectType: row.project_type,
    mode: row.mode,
    targetEpisodes: row.target_episodes,
    currentStage: row.current_stage,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stages: stages.map((stage) => ({
      key: stage.stage_key,
      position: stage.position,
      status: stage.status,
      label: stage.label,
      description: stage.description,
    })),
  }
}

export function createProductionPlan(
  db: DatabaseSync,
  input: {
    projectId: string
    projectType: ProjectType
    mode: ProductionMode
    targetEpisodes?: number
    currentStage?: ProductionStageKey
  },
): ProductionPlan {
  if (getProductionPlan(db, input.projectId)) {
    throw new InputError("这个项目已经存在生产计划")
  }
  const seed = createProductionPlanSeed(input)
  const id = randomUUID()
  const now = Date.now()

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(`
      INSERT INTO project_production_plans
        (id, project_id, project_type, mode, target_episodes, current_stage, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.projectId,
      seed.projectType,
      seed.mode,
      seed.targetEpisodes,
      seed.currentStage,
      seed.status,
      now,
      now,
    )
    writeStages(db, id, seed.stages, now)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getProductionPlan(db, input.projectId)!
}

export function updateProductionPlan(
  db: DatabaseSync,
  projectId: string,
  input: {
    mode?: ProductionMode
    targetEpisodes?: number
    currentStage?: ProductionStageKey
    status?: ProductionPlanStatus
  },
): ProductionPlan | null {
  const current = getProductionPlan(db, projectId)
  if (!current) return null
  const mode = input.mode ?? current.mode
  const targetEpisodes = normalizeProductionTarget(
    mode,
    input.targetEpisodes ?? (input.mode ? undefined : current.targetEpisodes),
  )
  const currentStage = input.currentStage ?? current.currentStage
  const status = input.status ?? current.status
  const now = Date.now()

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(`
      UPDATE project_production_plans
      SET mode = ?, target_episodes = ?, current_stage = ?, status = ?, updated_at = ?
      WHERE project_id = ?
    `).run(mode, targetEpisodes, currentStage, status, now, projectId)

    if (input.currentStage) {
      db.prepare(
        "UPDATE production_stages SET status = 'blocked', updated_at = ? WHERE plan_id = ?",
      ).run(now, current.id)
      db.prepare(`
        UPDATE production_stages SET status = 'draft', updated_at = ?
        WHERE plan_id = ? AND stage_key = ?
      `).run(now, current.id, currentStage)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getProductionPlan(db, projectId)
}

export function extendProductionPlan(
  db: DatabaseSync,
  projectId: string,
  input: {
    mode: ProductionMode
    targetEpisodes?: number
    existingEpisodeNumbers: readonly number[]
    estimatedUnits?: number
  },
): { plan: ProductionPlan; extension: ProductionExtension } {
  const current = getProductionPlan(db, projectId)
  if (!current) throw new InputError("请先创建生产计划")
  const planned = planProductionExtension({
    currentTargetEpisodes: current.targetEpisodes,
    nextMode: input.mode,
    nextTargetEpisodes: input.targetEpisodes,
    existingEpisodeNumbers: input.existingEpisodeNumbers,
  })
  if (planned.nextTargetEpisodes <= current.targetEpisodes) {
    throw new InputError("扩容目标必须大于当前目标集数")
  }
  const id = randomUUID()
  const now = Date.now()

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(`
      INSERT INTO production_extensions
        (id, plan_id, from_mode, to_mode, from_target_episodes, to_target_episodes,
         existing_episode_numbers, new_episode_numbers, estimated_units, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      current.id,
      current.mode,
      planned.nextMode,
      current.targetEpisodes,
      planned.nextTargetEpisodes,
      JSON.stringify(planned.existingEpisodeNumbers),
      JSON.stringify(planned.newEpisodeNumbers),
      Math.max(0, Math.round(input.estimatedUnits ?? 0)),
      now,
    )
    db.prepare(`
      UPDATE project_production_plans
      SET mode = ?, target_episodes = ?, updated_at = ?
      WHERE project_id = ?
    `).run(planned.nextMode, planned.nextTargetEpisodes, now, projectId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }

  const row = db.prepare(
    "SELECT * FROM production_extensions WHERE id = ?",
  ).get(id) as ExtensionRow
  return {
    plan: getProductionPlan(db, projectId)!,
    extension: toExtension(row),
  }
}

export function listProductionExtensions(
  db: DatabaseSync,
  projectId: string,
): ProductionExtension[] {
  const plan = getProductionPlan(db, projectId)
  if (!plan) return []
  return (db.prepare(
    "SELECT * FROM production_extensions WHERE plan_id = ? ORDER BY created_at DESC",
  ).all(plan.id) as ExtensionRow[]).map(toExtension)
}
