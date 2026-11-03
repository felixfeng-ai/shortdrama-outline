import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { STEPS, type StepKey } from "../types.ts"

export type DecisionStatus = "proposed" | "accepted" | "rejected" | "locked"

export interface ProjectDecision {
  id: string
  projectId: string
  step: StepKey
  targetType: string
  targetId: string
  question: string
  options: string[]
  chosenValue: string
  reason: string
  status: DecisionStatus
  confidence: number | null
  locked: boolean
  ownerId: string
  basedOnSnapshotId: string | null
  impact: string[]
  createdAt: number
  updatedAt: number
}

export interface ProjectJudgment {
  id: string
  projectId: string
  step: string
  action: string
  reason: string
  decisionId: string | null
  snapshotId: string | null
  ownerId: string
  createdAt: number
}

interface DecisionRow {
  id: string
  project_id: string
  step: string
  target_type: string
  target_id: string
  question: string
  options_json: string
  chosen_value: string
  reason: string
  status: string
  confidence: number | null
  locked: number
  owner_id: string
  based_on_snapshot_id: string | null
  impact_json: string
  created_at: number
  updated_at: number
}

interface JudgmentRow {
  id: string
  project_id: string
  step: string
  action: string
  reason: string
  decision_id: string | null
  snapshot_id: string | null
  owner_id: string
  created_at: number
}

const STEP_KEYS = new Set<StepKey>(STEPS.map((step) => step.key))
const STATUSES = new Set<DecisionStatus>(["proposed", "accepted", "rejected", "locked"])

function text(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : ""
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .map((item) => text(item, maxLength))
      .filter(Boolean),
  )].slice(0, maxItems)
}

function parseStringList(value: string, maxItems: number): string[] {
  try {
    return stringList(JSON.parse(value), maxItems, 200)
  } catch {
    return []
  }
}

function status(value: unknown, fallback: DecisionStatus = "proposed"): DecisionStatus {
  return typeof value === "string" && STATUSES.has(value as DecisionStatus)
    ? value as DecisionStatus
    : fallback
}

function decisionRow(row: DecisionRow): ProjectDecision {
  return {
    id: row.id,
    projectId: row.project_id,
    step: row.step as StepKey,
    targetType: row.target_type,
    targetId: row.target_id,
    question: row.question,
    options: parseStringList(row.options_json, 6),
    chosenValue: row.chosen_value,
    reason: row.reason,
    status: status(row.status),
    confidence: row.confidence === null ? null : Number(row.confidence),
    locked: Number(row.locked) === 1,
    ownerId: row.owner_id,
    basedOnSnapshotId: row.based_on_snapshot_id,
    impact: parseStringList(row.impact_json, 12),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function judgmentRow(row: JudgmentRow): ProjectJudgment {
  return {
    id: row.id,
    projectId: row.project_id,
    step: row.step,
    action: row.action,
    reason: row.reason,
    decisionId: row.decision_id,
    snapshotId: row.snapshot_id,
    ownerId: row.owner_id,
    createdAt: Number(row.created_at),
  }
}

function id(prefix: string, now: number): string {
  return `${prefix}_${now}_${Math.random().toString(36).slice(2, 9)}`
}

export function listProjectDecisions(
  db: DatabaseSync,
  projectId: string,
  limit = 100,
): ProjectDecision[] {
  return (db.prepare(
    `SELECT * FROM project_decisions
     WHERE project_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`,
  ).all(projectId, Math.max(1, Math.min(200, limit))) as DecisionRow[])
    .map(decisionRow)
}

export function getProjectDecision(
  db: DatabaseSync,
  projectId: string,
  decisionId: string,
): ProjectDecision | null {
  const row = db.prepare(
    "SELECT * FROM project_decisions WHERE project_id = ? AND id = ?",
  ).get(projectId, decisionId) as DecisionRow | undefined
  return row ? decisionRow(row) : null
}

export function listProjectJudgments(
  db: DatabaseSync,
  projectId: string,
  limit = 100,
): ProjectJudgment[] {
  return (db.prepare(
    `SELECT * FROM project_judgments
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(projectId, Math.max(1, Math.min(200, limit))) as JudgmentRow[])
    .map(judgmentRow)
}

export function createProjectJudgment(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  input: {
    step?: unknown
    action?: unknown
    reason?: unknown
    decisionId?: unknown
    snapshotId?: unknown
  },
  now = Date.now(),
): ProjectJudgment {
  const step = text(input.step, 20)
  const action = text(input.action, 80)
  if (!step || !action) throw new InputError("判断记录缺少步骤或动作")
  const judgmentId = id("judgment", now)
  db.prepare(
    `INSERT INTO project_judgments
      (id, project_id, step, action, reason, decision_id, snapshot_id, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    judgmentId,
    projectId,
    step,
    action,
    text(input.reason, 300),
    typeof input.decisionId === "string" ? input.decisionId : null,
    typeof input.snapshotId === "string" ? input.snapshotId : null,
    ownerId,
    now,
  )
  return judgmentRow(db.prepare(
    "SELECT * FROM project_judgments WHERE id = ?",
  ).get(judgmentId) as JudgmentRow)
}

export function createProjectDecision(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  input: {
    step?: unknown
    targetType?: unknown
    targetId?: unknown
    question?: unknown
    options?: unknown
    chosenValue?: unknown
    reason?: unknown
    status?: unknown
    confidence?: unknown
    locked?: unknown
    basedOnSnapshotId?: unknown
    impact?: unknown
  },
  now = Date.now(),
): ProjectDecision {
  const step = text(input.step, 20) as StepKey
  if (!STEP_KEYS.has(step)) throw new InputError("决策步骤不合法")
  const question = text(input.question, 240)
  if (!question) throw new InputError("决策问题不能为空")
  const options = stringList(input.options, 6, 160)
  if (options.length < 2) throw new InputError("决策至少需要两个候选方案")
  const chosenValue = text(input.chosenValue, 160)
  const decisionStatus = status(input.status)
  if ((decisionStatus === "accepted" || decisionStatus === "locked") && !chosenValue) {
    throw new InputError("接受决策时必须选择方案")
  }
  const confidenceNumber = input.confidence === undefined || input.confidence === null
    ? null
    : Number(input.confidence)
  if (
    confidenceNumber !== null
    && (!Number.isFinite(confidenceNumber) || confidenceNumber < 0 || confidenceNumber > 1)
  ) {
    throw new InputError("决策置信度必须在 0 到 1 之间")
  }
  const decisionId = id("decision", now)
  const locked = input.locked === true || decisionStatus === "locked"
  const finalStatus: DecisionStatus = decisionStatus === "locked" ? "locked" : decisionStatus
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO project_decisions
        (id, project_id, step, target_type, target_id, question, options_json,
         chosen_value, reason, status, confidence, locked, owner_id,
         based_on_snapshot_id, impact_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      decisionId,
      projectId,
      step,
      text(input.targetType, 40),
      text(input.targetId, 120),
      question,
      JSON.stringify(options),
      chosenValue,
      text(input.reason, 500),
      finalStatus,
      confidenceNumber,
      locked ? 1 : 0,
      ownerId,
      typeof input.basedOnSnapshotId === "string" ? input.basedOnSnapshotId : null,
      JSON.stringify(stringList(input.impact, 12, 80)),
      now,
      now,
    )
    if (finalStatus === "accepted" || finalStatus === "rejected" || finalStatus === "locked") {
      createProjectJudgment(db, projectId, ownerId, {
        step,
        action: `决策：${question}`,
        reason: text(input.reason, 300) || chosenValue,
        decisionId,
      }, now)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getProjectDecision(db, projectId, decisionId)!
}

export function updateProjectDecision(
  db: DatabaseSync,
  projectId: string,
  decisionId: string,
  ownerId: string,
  input: {
    chosenValue?: unknown
    reason?: unknown
    status?: unknown
    confidence?: unknown
    locked?: unknown
    unlock?: unknown
  },
  now = Date.now(),
): ProjectDecision {
  const current = getProjectDecision(db, projectId, decisionId)
  if (!current) throw new InputError("决策不存在")
  if (current.locked && input.unlock !== true) {
    const error = new Error("该决策已锁定，请先明确解锁") as Error & { status: number }
    error.status = 409
    throw error
  }
  const nextStatus = input.status === undefined ? current.status : status(input.status, current.status)
  const nextChosen = input.chosenValue === undefined
    ? current.chosenValue
    : text(input.chosenValue, 160)
  if ((nextStatus === "accepted" || nextStatus === "locked") && !nextChosen) {
    throw new InputError("接受决策时必须选择方案")
  }
  const nextConfidence = input.confidence === undefined
    ? current.confidence
    : input.confidence === null ? null : Number(input.confidence)
  if (
    nextConfidence !== null
    && (!Number.isFinite(nextConfidence) || nextConfidence < 0 || nextConfidence > 1)
  ) {
    throw new InputError("决策置信度必须在 0 到 1 之间")
  }
  const nextLocked = input.locked === undefined ? current.locked : input.locked === true
  const finalStatus: DecisionStatus = nextLocked || nextStatus === "locked" ? "locked" : nextStatus
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `UPDATE project_decisions
       SET chosen_value = ?, reason = ?, status = ?, confidence = ?, locked = ?,
           owner_id = ?, updated_at = ?
       WHERE project_id = ? AND id = ?`,
    ).run(
      nextChosen,
      input.reason === undefined ? current.reason : text(input.reason, 500),
      finalStatus,
      nextConfidence,
      nextLocked ? 1 : 0,
      ownerId,
      now,
      projectId,
      decisionId,
    )
    if (finalStatus !== current.status) {
      createProjectJudgment(db, projectId, ownerId, {
        step: current.step,
        action: `决策状态：${current.status} → ${finalStatus}`,
        reason: input.reason === undefined ? current.reason : text(input.reason, 300),
        decisionId,
      }, now)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getProjectDecision(db, projectId, decisionId)!
}
