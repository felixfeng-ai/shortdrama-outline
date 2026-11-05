import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

import {
  getSnapshot,
  latestSnapshot,
  type ArtifactKind,
  type Snapshot,
} from "../assets/repo.ts"
import { persistEditedArtifact } from "../assets/persist.ts"
import type { AgentActionKind } from "./plan.ts"

export type AgentRunStatus = "applied" | "rolled_back"

export interface AgentActionRunDto {
  id: string
  projectId: string
  actionKind: AgentActionKind
  artifactKind: ArtifactKind
  targetType: "character" | "place" | "episode" | "shot"
  targetId: string
  targetLabel: string
  field: string
  summary: string
  beforeSnapshotId: string
  afterSnapshotId: string
  rollbackSnapshotId: string | null
  status: AgentRunStatus
  createdAt: number
  rolledBackAt: number | null
}

export interface AgentActionInput {
  projectId: string
  ownerId: string
  actionKind: AgentActionKind
  artifactKind: ArtifactKind
  targetType: "character" | "place" | "episode" | "shot"
  targetId: string
  targetLabel: string
  field: string
  summary: string
  beforePayload: unknown
  afterPayload: unknown
}

interface AgentRunRow {
  id: string
  project_id: string
  action_kind: AgentActionKind
  artifact_kind: ArtifactKind
  target_type: "character" | "place" | "episode" | "shot"
  target_id: string
  target_label: string
  field: string
  summary: string
  before_snapshot_id: string
  after_snapshot_id: string
  rollback_snapshot_id: string | null
  status: AgentRunStatus
  created_at: number
  rolled_back_at: number | null
}

export class AgentRunConflictError extends Error {
  code: "stale" | "not_applied" | "missing_snapshot"

  constructor(code: AgentRunConflictError["code"], message: string) {
    super(message)
    this.name = "AgentRunConflictError"
    this.code = code
  }
}

function toRunDto(row: AgentRunRow): AgentActionRunDto {
  return {
    id: row.id,
    projectId: row.project_id,
    actionKind: row.action_kind,
    artifactKind: row.artifact_kind,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    field: row.field,
    summary: row.summary,
    beforeSnapshotId: row.before_snapshot_id,
    afterSnapshotId: row.after_snapshot_id,
    rollbackSnapshotId: row.rollback_snapshot_id,
    status: row.status,
    createdAt: row.created_at,
    rolledBackAt: row.rolled_back_at,
  }
}

function samePayload(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function insertRun(db: DatabaseSync, input: {
  projectId: string
  ownerId: string
  actionKind: AgentActionKind
  artifactKind: ArtifactKind
  targetType: AgentActionInput["targetType"]
  targetId: string
  targetLabel: string
  field: string
  summary: string
  beforeSnapshotId: string
  afterSnapshotId: string
}): AgentActionRunDto {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(`
    INSERT INTO agent_action_runs (
      id, project_id, owner_id, action_kind, artifact_kind,
      target_type, target_id, target_label, field, summary,
      before_snapshot_id, after_snapshot_id, rollback_snapshot_id,
      status, created_at, rolled_back_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'applied', ?, NULL)
  `).run(
    id,
    input.projectId,
    input.ownerId,
    input.actionKind,
    input.artifactKind,
    input.targetType,
    input.targetId,
    input.targetLabel,
    input.field,
    input.summary,
    input.beforeSnapshotId,
    input.afterSnapshotId,
    now,
  )
  return getRun(db, input.projectId, id)!
}

/**
 * 执行一次 Agent 文本修改。
 *
 * before/after 快照与运行记录放在同一事务里，避免出现“正文改了但记录没写”
 * 或“有可回滚记录但正文并未落库”的半状态。
 */
export function applyAgentAction(
  db: DatabaseSync,
  input: AgentActionInput,
): { run: AgentActionRunDto; beforeSnapshot: Snapshot; afterSnapshot: Snapshot } {
  db.exec("BEGIN IMMEDIATE")
  try {
    const latest = latestSnapshot(db, input.projectId, input.artifactKind)
    const beforeSnapshot = latest && samePayload(latest.payload, input.beforePayload)
      ? latest
      : persistEditedArtifact(db, input.projectId, input.artifactKind, input.beforePayload)
    const afterSnapshot = persistEditedArtifact(db, input.projectId, input.artifactKind, input.afterPayload)
    const run = insertRun(db, {
      ...input,
      beforeSnapshotId: beforeSnapshot.id,
      afterSnapshotId: afterSnapshot.id,
    })
    db.exec("COMMIT")
    return { run, beforeSnapshot, afterSnapshot }
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function listAgentActionRuns(
  db: DatabaseSync,
  projectId: string,
  limit = 20,
): AgentActionRunDto[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const rows = db.prepare(`
    SELECT *
    FROM agent_action_runs
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(projectId, safeLimit) as AgentRunRow[]
  return rows.map(toRunDto)
}

export function getRun(
  db: DatabaseSync,
  projectId: string,
  runId: string,
): AgentActionRunDto | null {
  const row = db.prepare(`
    SELECT *
    FROM agent_action_runs
    WHERE project_id = ? AND id = ?
  `).get(projectId, runId) as AgentRunRow | undefined
  return row ? toRunDto(row) : null
}

/**
 * 回滚不是覆盖旧记录，而是把 before 内容再保存为一版新快照。
 * 因此版本链、影响范围和导出审计都能继续追溯“曾经改过什么”。
 */
export function rollbackAgentAction(
  db: DatabaseSync,
  projectId: string,
  runId: string,
): { run: AgentActionRunDto; snapshot: Snapshot; payload: unknown } {
  db.exec("BEGIN IMMEDIATE")
  try {
    const run = getRun(db, projectId, runId)
    if (!run) throw new AgentRunConflictError("missing_snapshot", "这条执行记录不存在。")
    if (run.status !== "applied") {
      throw new AgentRunConflictError("not_applied", "这条执行记录已经回滚，不能重复操作。")
    }

    const latest = latestSnapshot(db, projectId, run.artifactKind)
    if (!latest || latest.id !== run.afterSnapshotId) {
      throw new AgentRunConflictError(
        "stale",
        "该操作之后项目已有新版本，不能自动回滚；请先核对最新内容。",
      )
    }

    const before = getSnapshot(db, run.beforeSnapshotId)
    if (!before || before.projectId !== projectId || before.kind !== run.artifactKind) {
      throw new AgentRunConflictError("missing_snapshot", "回滚所需的前一版快照已不存在。")
    }

    const snapshot = persistEditedArtifact(db, projectId, run.artifactKind, before.payload)
    const now = Date.now()
    db.prepare(`
      UPDATE agent_action_runs
      SET status = 'rolled_back', rollback_snapshot_id = ?, rolled_back_at = ?
      WHERE project_id = ? AND id = ?
    `).run(snapshot.id, now, projectId, runId)
    const rolled = getRun(db, projectId, runId)!
    db.exec("COMMIT")
    return { run: rolled, snapshot, payload: before.payload }
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}
