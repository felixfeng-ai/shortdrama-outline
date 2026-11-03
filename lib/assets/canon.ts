import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

import { InputError } from "../api.ts"
import { MAX_EPISODE_COUNT } from "../episodes.ts"

export const CANON_KINDS = ["character", "place", "prop", "relationship"] as const
export type CanonKind = (typeof CANON_KINDS)[number]
export type CanonSeverity = "error" | "warning"

export interface CanonEntity {
  id: string
  projectId: string
  kind: CanonKind
  name: string
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface CanonFact {
  id: string
  projectId: string
  entityId: string
  entityName: string
  entityKind: CanonKind
  field: string
  value: string
  validFromEpisode: number
  validToEpisode: number
  sourceSnapshotId: string | null
  locked: boolean
  createdAt: number
  updatedAt: number
}

export interface CanonIssue {
  code: "overlapping-values" | "invalid-range" | "fragmented-value"
  severity: CanonSeverity
  entityId: string
  entityName: string
  field: string
  message: string
  factIds: string[]
}

interface EntityRow {
  id: string
  project_id: string
  kind: string
  name: string
  metadata_json: string
  created_at: number
  updated_at: number
}

interface FactRow {
  id: string
  project_id: string
  entity_id: string
  field: string
  value: string
  valid_from_episode: number
  valid_to_episode: number
  source_snapshot_id: string | null
  locked: number
  created_at: number
  updated_at: number
  entity_name: string
  entity_kind: string
}

function text(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : ""
}

function episode(value: unknown, label: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback
  const number = Number(value)
  if (
    !Number.isSafeInteger(number)
    || number < 1
    || number > MAX_EPISODE_COUNT
  ) {
    throw new InputError(`${label}必须在 1–${MAX_EPISODE_COUNT} 集之间`)
  }
  return number
}

function kind(value: unknown): CanonKind {
  if (typeof value === "string" && CANON_KINDS.includes(value as CanonKind)) {
    return value as CanonKind
  }
  throw new InputError("Canon 实体类型不合法")
}

function entityRow(row: EntityRow): CanonEntity {
  let metadata: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(row.metadata_json)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed
  } catch {
    // 旧数据损坏时返回空 metadata，不让整个 Canon 读取失败
  }
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as CanonKind,
    name: row.name,
    metadata,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function factRow(row: FactRow): CanonFact {
  return {
    id: row.id,
    projectId: row.project_id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    entityKind: row.entity_kind as CanonKind,
    field: row.field,
    value: row.value,
    validFromEpisode: Number(row.valid_from_episode),
    validToEpisode: Number(row.valid_to_episode),
    sourceSnapshotId: row.source_snapshot_id,
    locked: Number(row.locked) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

/**
 * 纯函数审计，不读取数据库，便于测试和未来在 Agent 侧复用。
 *
 * 规则刻意保守：
 * - 只比较同实体、同字段；
 * - 集数闭区间有交集且值不同才算 error；
 * - 同值但中间有空洞只给 warning，因为可能是剧情中暂时失忆或道具离场。
 */
export function auditCanonFacts(facts: CanonFact[]): CanonIssue[] {
  const issues: CanonIssue[] = []
  for (const fact of facts) {
    if (fact.validFromEpisode > fact.validToEpisode) {
      issues.push({
        code: "invalid-range",
        severity: "error",
        entityId: fact.entityId,
        entityName: fact.entityName,
        field: fact.field,
        factIds: [fact.id],
        message: `${fact.entityName} 的「${fact.field}」集数范围非法：${fact.validFromEpisode}-${fact.validToEpisode}`,
      })
    }
  }

  const groups = new Map<string, CanonFact[]>()
  for (const fact of facts) {
    const key = `${fact.entityId}\u0001${fact.field}`
    const list = groups.get(key) ?? []
    list.push(fact)
    groups.set(key, list)
  }

  for (const group of groups.values()) {
    const sorted = group.slice().sort((left, right) =>
      left.validFromEpisode - right.validFromEpisode
      || left.validToEpisode - right.validToEpisode
    )
    for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
        const left = sorted[leftIndex]
        const right = sorted[rightIndex]
        const overlaps = left.validFromEpisode <= right.validToEpisode
          && right.validFromEpisode <= left.validToEpisode
        if (overlaps && left.value !== right.value) {
          issues.push({
            code: "overlapping-values",
            severity: "error",
            entityId: left.entityId,
            entityName: left.entityName,
            field: left.field,
            factIds: [left.id, right.id],
            message: `${left.entityName} 的「${left.field}」在 ${Math.max(left.validFromEpisode, right.validFromEpisode)}-${Math.min(left.validToEpisode, right.validToEpisode)} 集冲突：${left.value} / ${right.value}`,
          })
        }
      }
    }

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (
        previous.value === current.value
        && current.validFromEpisode > previous.validToEpisode + 1
      ) {
        issues.push({
          code: "fragmented-value",
          severity: "warning",
          entityId: current.entityId,
          entityName: current.entityName,
          field: current.field,
          factIds: [previous.id, current.id],
          message: `${current.entityName} 的「${current.field}」相同状态分成 ${previous.validFromEpisode}-${previous.validToEpisode} 与 ${current.validFromEpisode}-${current.validToEpisode}，中间存在未定义区间`,
        })
      }
    }
  }
  return issues
}

function readFacts(db: DatabaseSync, projectId: string): CanonFact[] {
  return (db.prepare(
    `SELECT f.*, e.name AS entity_name, e.kind AS entity_kind
     FROM canon_facts f
     JOIN canon_entities e ON e.id = f.entity_id
     WHERE f.project_id = ?
     ORDER BY e.name, f.field, f.valid_from_episode`,
  ).all(projectId) as FactRow[]).map(factRow)
}

export function getProjectCanon(db: DatabaseSync, projectId: string): {
  entities: CanonEntity[]
  facts: CanonFact[]
  issues: CanonIssue[]
} {
  const entities = (db.prepare(
    "SELECT * FROM canon_entities WHERE project_id = ? ORDER BY kind, name",
  ).all(projectId) as EntityRow[]).map(entityRow)
  const facts = readFacts(db, projectId)
  return { entities, facts, issues: auditCanonFacts(facts) }
}

/**
 * 创建 Canon 事实。
 *
 * 事务内先找/建实体再写事实，避免并发请求只建立了实体却失败在事实写入；
 * 唯一约束保证完全相同的区间和值不会重复。重复写入返回已有记录，属于幂等行为。
 */
export function createCanonFact(
  db: DatabaseSync,
  projectId: string,
  input: {
    kind?: unknown
    name?: unknown
    field?: unknown
    value?: unknown
    validFromEpisode?: unknown
    validToEpisode?: unknown
    sourceSnapshotId?: unknown
    locked?: unknown
  },
  now = Date.now(),
): CanonFact {
  const entityKind = kind(input.kind)
  const name = text(input.name, 80)
  const field = text(input.field, 100)
  const value = text(input.value, 300)
  if (!name || !field || !value) throw new InputError("Canon 实体、字段和值不能为空")
  const from = episode(input.validFromEpisode, "开始集")
  const to = episode(input.validToEpisode, "结束集")
  if (from > to) throw new InputError("Canon 开始集不能大于结束集")

  db.exec("BEGIN IMMEDIATE")
  try {
    let entity = db.prepare(
      "SELECT * FROM canon_entities WHERE project_id = ? AND kind = ? AND name = ?",
    ).get(projectId, entityKind, name) as EntityRow | undefined
    let entityId = entity?.id ?? ""
    if (!entity) {
      entityId = `canon_${randomUUID()}`
      db.prepare(
        `INSERT INTO canon_entities
          (id, project_id, kind, name, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, '{}', ?, ?)`,
      ).run(entityId, projectId, entityKind, name, now, now)
    }
    const existing = db.prepare(
      `SELECT f.*, e.name AS entity_name, e.kind AS entity_kind
       FROM canon_facts f
       JOIN canon_entities e ON e.id = f.entity_id
       WHERE f.project_id = ? AND f.entity_id = ? AND f.field = ?
         AND f.value = ? AND f.valid_from_episode = ? AND f.valid_to_episode = ?`,
    ).get(projectId, entityId, field, value, from, to) as FactRow | undefined
    if (existing) {
      db.exec("COMMIT")
      return factRow(existing)
    }
    const factId = `fact_${randomUUID()}`
    db.prepare(
      `INSERT INTO canon_facts
        (id, project_id, entity_id, field, value, valid_from_episode, valid_to_episode,
         source_snapshot_id, locked, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      factId,
      projectId,
      entityId,
      field,
      value,
      from,
      to,
      typeof input.sourceSnapshotId === "string" ? input.sourceSnapshotId : null,
      input.locked === true ? 1 : 0,
      now,
      now,
    )
    db.exec("COMMIT")
    return factRow(db.prepare(
      `SELECT f.*, e.name AS entity_name, e.kind AS entity_kind
       FROM canon_facts f
       JOIN canon_entities e ON e.id = f.entity_id
       WHERE f.id = ?`,
    ).get(factId) as FactRow)
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}
