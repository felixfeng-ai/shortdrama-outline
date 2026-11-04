import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import {
  getProjectCanon,
  type CanonEntity,
  type CanonFact,
} from "../assets/canon.ts"
import { getLocalizationBranch } from "./branches.ts"
import {
  MARKET_CODES,
  MARKET_PROFILES,
  getMarketProfile,
  type MarketCode,
  type MarketProfile,
} from "./catalog.ts"

export {
  MARKET_CODES,
  MARKET_PROFILES,
  getMarketProfile,
  type MarketCode,
  type MarketProfile,
}

export interface LocalizationAdaptationBrief {
  audience: string
  emotion: string
  strategy: string
  redlines: string[]
}

export interface SubtitleRules {
  maxLineChars: number
  maxCps: number
  minDurationMs: number
  maxDurationMs: number
}

export interface BranchContext {
  branchId: string
  projectId: string
  marketCode: MarketCode
  profile: MarketProfile
  platforms: string[]
  contentRating: string
  adaptationBrief: LocalizationAdaptationBrief
  subtitle: SubtitleRules
  notes: string
  version: number
  updatedBy: string
  updatedAt: number
}

export interface GlossaryEntry {
  id: string
  projectId: string
  branchId: string
  source: string
  target: string
  kind: string
  locked: boolean
  caseSensitive: boolean
  notes: string
  createdAt: number
  updatedAt: number
}

export interface BranchCanonFact {
  id: string
  projectId: string
  branchId: string
  entityId: string
  entityName: string
  entityKind: string
  field: string
  value: string
  validFromEpisode: number
  validToEpisode: number
  sourceSnapshotId: string | null
  locked: boolean
  createdAt: number
  updatedAt: number
}

export interface BranchCanonIssue {
  code: "branch-override" | "branch-conflict" | "range-conflict"
  severity: "warning" | "error"
  entityId: string
  entityName: string
  field: string
  message: string
}

interface ContextRow {
  branch_id: string
  project_id: string
  market_code: string
  platforms_json: string
  content_rating: string
  adaptation_json: string
  subtitle_json: string
  notes: string
  version: number
  updated_by: string
  updated_at: number
}

interface GlossaryRow {
  id: string
  project_id: string
  branch_id: string
  source: string
  target: string
  kind: string
  locked: number
  case_sensitive: number
  notes: string
  created_at: number
  updated_at: number
}

interface BranchFactRow {
  id: string
  project_id: string
  branch_id: string
  entity_id: string
  entity_name: string
  entity_kind: string
  field: string
  value: string
  valid_from_episode: number
  valid_to_episode: number
  source_snapshot_id: string | null
  locked: number
  created_at: number
  updated_at: number
}

function text(value: unknown, max: number, preserveLines = false): string {
  if (typeof value !== "string") return ""
  return preserveLines
    ? value.trim().slice(0, max)
    : value.trim().replace(/\s+/g, " ").slice(0, max)
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value.map((item) => text(item, maxLength)).filter(Boolean),
  )].slice(0, maxItems)
}

function readAdaptationBrief(value: unknown): LocalizationAdaptationBrief {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    audience: text(source.audience, 160),
    emotion: text(source.emotion, 160),
    strategy: text(source.strategy, 1_000, true),
    redlines: stringList(source.redlines, 12, 200),
  }
}

function readSubtitleRules(value: unknown, profile: MarketProfile): SubtitleRules {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    maxLineChars: integer(source.maxLineChars, profile.subtitle.maxLineChars, 10, 120),
    maxCps: integer(source.maxCps, profile.subtitle.maxCps, 5, 40),
    minDurationMs: integer(source.minDurationMs, profile.subtitle.minDurationMs, 300, 5_000),
    maxDurationMs: integer(source.maxDurationMs, profile.subtitle.maxDurationMs, 1_000, 12_000),
  }
}

function contextRow(row: ContextRow): BranchContext {
  const profile = getMarketProfile(row.market_code)
  if (!profile) throw new InputError("分支上下文的市场已失效")
  let platforms: string[] = []
  let adaptationBrief: unknown = null
  let subtitle: unknown = null
  try { platforms = JSON.parse(row.platforms_json) } catch { platforms = [] }
  try { adaptationBrief = JSON.parse(row.adaptation_json) } catch { adaptationBrief = null }
  try { subtitle = JSON.parse(row.subtitle_json) } catch { subtitle = null }
  return {
    branchId: row.branch_id,
    projectId: row.project_id,
    marketCode: profile.code,
    profile,
    platforms: stringList(platforms, 12, 60),
    contentRating: row.content_rating,
    adaptationBrief: readAdaptationBrief(adaptationBrief),
    subtitle: readSubtitleRules(subtitle, profile),
    notes: row.notes,
    version: Number(row.version),
    updatedBy: row.updated_by,
    updatedAt: Number(row.updated_at),
  }
}

function requireBranch(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
) {
  const branch = getLocalizationBranch(db, projectId, branchId, ownerId)
  if (!branch) {
    const error = new Error("本地化分支不存在或无权访问") as Error & { status: number }
    error.status = 403
    throw error
  }
  return branch
}

export function getBranchContext(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
): BranchContext | null {
  requireBranch(db, projectId, branchId, ownerId)
  const row = db.prepare(
    "SELECT * FROM project_branch_context WHERE project_id = ? AND branch_id = ?",
  ).get(projectId, branchId) as ContextRow | undefined
  return row ? contextRow(row) : null
}

/**
 * 分支上下文使用乐观锁保存。先校验分支归属，再在同一事务里做版本比较和 upsert；
 * 任何失败都回滚，避免版本号已增加但内容仍是旧的。
 */
export function saveBranchContext(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
  input: Record<string, unknown>,
  now = Date.now(),
): BranchContext {
  requireBranch(db, projectId, branchId, ownerId)
  const profile = getMarketProfile(input.marketCode)
  if (!profile) throw new InputError("目标市场不合法")
  const existing = db.prepare(
    "SELECT * FROM project_branch_context WHERE branch_id = ? AND project_id = ?",
  ).get(branchId, projectId) as ContextRow | undefined
  const expected = input.version === undefined ? null : Number(input.version)
  if (expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) {
    throw new InputError("分支上下文版本不正确")
  }
  if (expected !== null && Number(existing?.version ?? 0) !== expected) {
    const error = new Error("分支上下文已在其他设备更新，请刷新后重试") as Error & { status: number }
    error.status = 409
    throw error
  }
  const nextVersion = Number(existing?.version ?? 0) + 1
  const platforms = stringList(input.platforms, 12, 60)
  const contentRating = text(input.contentRating, 40) || profile.defaultRating
  const adaptationBrief = readAdaptationBrief(input.adaptationBrief)
  const subtitle = readSubtitleRules(input.subtitle, profile)
  const notes = text(input.notes, 4_000, true)

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO project_branch_context
        (branch_id, project_id, market_code, platforms_json, content_rating,
         adaptation_json, subtitle_json, notes, version, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(branch_id) DO UPDATE SET
         market_code = excluded.market_code,
         platforms_json = excluded.platforms_json,
         content_rating = excluded.content_rating,
         adaptation_json = excluded.adaptation_json,
         subtitle_json = excluded.subtitle_json,
         notes = excluded.notes,
         version = excluded.version,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
    ).run(
      branchId,
      projectId,
      profile.code,
      JSON.stringify(platforms),
      contentRating,
      JSON.stringify(adaptationBrief),
      JSON.stringify(subtitle),
      notes,
      nextVersion,
      ownerId,
      now,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getBranchContext(db, projectId, branchId, ownerId)!
}

function glossaryRow(row: GlossaryRow): GlossaryEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    branchId: row.branch_id,
    source: row.source,
    target: row.target,
    kind: row.kind,
    locked: Number(row.locked) === 1,
    caseSensitive: Number(row.case_sensitive) === 1,
    notes: row.notes,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function listGlossary(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
): GlossaryEntry[] {
  requireBranch(db, projectId, branchId, ownerId)
  return (db.prepare(
    `SELECT * FROM project_branch_glossary
     WHERE project_id = ? AND branch_id = ?
     ORDER BY source ASC`,
  ).all(projectId, branchId) as GlossaryRow[]).map(glossaryRow)
}

export function upsertGlossaryEntry(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
  input: Record<string, unknown>,
  now = Date.now(),
): GlossaryEntry {
  requireBranch(db, projectId, branchId, ownerId)
  const source = text(input.source, 300)
  const target = text(input.target, 500)
  if (!source) throw new InputError("术语原文不能为空")
  if (!target) throw new InputError("术语译法不能为空")
  const kind = text(input.kind, 40) || "term"
  const locked = input.locked === true ? 1 : 0
  const caseSensitive = input.caseSensitive === true ? 1 : 0
  const notes = text(input.notes, 1_000, true)
  db.exec("BEGIN IMMEDIATE")
  try {
    const existing = db.prepare(
      `SELECT * FROM project_branch_glossary
       WHERE project_id = ? AND branch_id = ? AND source = ?`,
    ).get(projectId, branchId, source) as GlossaryRow | undefined
    const id = existing?.id ?? `glossary_${randomUUID()}`
    db.prepare(
      `INSERT INTO project_branch_glossary
        (id, project_id, branch_id, source, target, kind, locked, case_sensitive,
         notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, branch_id, source) DO UPDATE SET
         target = excluded.target,
         kind = excluded.kind,
         locked = excluded.locked,
         case_sensitive = excluded.case_sensitive,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
    ).run(
      id,
      projectId,
      branchId,
      source,
      target,
      kind,
      locked,
      caseSensitive,
      notes,
      existing?.created_at ?? now,
      now,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return glossaryRow(db.prepare(
    `SELECT * FROM project_branch_glossary
     WHERE project_id = ? AND branch_id = ? AND source = ?`,
  ).get(projectId, branchId, source) as GlossaryRow)
}

function branchFactRow(row: BranchFactRow): BranchCanonFact {
  return {
    id: row.id,
    projectId: row.project_id,
    branchId: row.branch_id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    entityKind: row.entity_kind,
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

const CANON_KINDS = new Set(["character", "place", "prop", "relationship"])

function ensureCanonEntity(
  db: DatabaseSync,
  projectId: string,
  kind: string,
  name: string,
  now: number,
): { id: string; name: string; kind: string } {
  const existing = db.prepare(
    "SELECT id, name, kind FROM canon_entities WHERE project_id = ? AND kind = ? AND name = ?",
  ).get(projectId, kind, name) as { id: string; name: string; kind: string } | undefined
  if (existing) return existing
  const id = `canon_${randomUUID()}`
  db.prepare(
    `INSERT INTO canon_entities
      (id, project_id, kind, name, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, '{}', ?, ?)`,
  ).run(id, projectId, kind, name, now, now)
  return { id, name, kind }
}

export function createBranchCanonFact(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
  input: Record<string, unknown>,
  now = Date.now(),
): BranchCanonFact {
  requireBranch(db, projectId, branchId, ownerId)
  const kind = text(input.kind, 40)
  const name = text(input.name, 120)
  const field = text(input.field, 100)
  const value = text(input.value, 500)
  const from = integer(input.validFromEpisode, 1, 1, 999)
  const to = integer(input.validToEpisode, from, 1, 999)
  if (!CANON_KINDS.has(kind)) throw new InputError("Canon 实体类型不合法")
  if (!name || !field || !value) throw new InputError("Canon 实体、字段和值不能为空")
  if (from > to) throw new InputError("Canon 开始集不能大于结束集")
  const sourceSnapshotId = text(input.sourceSnapshotId, 160) || null
  const locked = input.locked === true ? 1 : 0
  db.exec("BEGIN IMMEDIATE")
  try {
    const entity = ensureCanonEntity(db, projectId, kind, name, now)
    const existing = db.prepare(
      `SELECT f.*, e.name AS entity_name, e.kind AS entity_kind
       FROM project_branch_canon_facts f
       JOIN canon_entities e ON e.id = f.entity_id
       WHERE f.project_id = ? AND f.branch_id = ? AND f.entity_id = ?
         AND f.field = ? AND f.value = ?
         AND f.valid_from_episode = ? AND f.valid_to_episode = ?`,
    ).get(projectId, branchId, entity.id, field, value, from, to) as BranchFactRow | undefined
    if (!existing) {
      db.prepare(
        `INSERT INTO project_branch_canon_facts
          (id, project_id, branch_id, entity_id, field, value,
           valid_from_episode, valid_to_episode, source_snapshot_id, locked,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `branch_fact_${randomUUID()}`,
        projectId,
        branchId,
        entity.id,
        field,
        value,
        from,
        to,
        sourceSnapshotId,
        locked,
        now,
        now,
      )
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return branchFactRow(db.prepare(
    `SELECT f.*, e.name AS entity_name, e.kind AS entity_kind
     FROM project_branch_canon_facts f
     JOIN canon_entities e ON e.id = f.entity_id
     WHERE f.project_id = ? AND f.branch_id = ? AND e.name = ? AND f.field = ? AND f.value = ?
     LIMIT 1`,
  ).get(projectId, branchId, name, field, value) as BranchFactRow)
}

export function getBranchCanon(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
): {
  entities: CanonEntity[]
  facts: BranchCanonFact[]
  globalFacts: CanonFact[]
  issues: BranchCanonIssue[]
} {
  requireBranch(db, projectId, branchId, ownerId)
  const global = getProjectCanon(db, projectId)
  const facts = (db.prepare(
    `SELECT f.*, e.name AS entity_name, e.kind AS entity_kind
     FROM project_branch_canon_facts f
     JOIN canon_entities e ON e.id = f.entity_id
     WHERE f.project_id = ? AND f.branch_id = ?
     ORDER BY e.name, f.field, f.valid_from_episode`,
  ).all(projectId, branchId) as BranchFactRow[]).map(branchFactRow)
  const issues: BranchCanonIssue[] = []
  for (const fact of facts) {
    const override = global.facts.find((globalFact) =>
      globalFact.entityId === fact.entityId
      && globalFact.field === fact.field
      && globalFact.value !== fact.value
      && globalFact.validFromEpisode <= fact.validToEpisode
      && globalFact.validToEpisode >= fact.validFromEpisode
    )
    if (override) {
      issues.push({
        code: "branch-override",
        severity: "warning",
        entityId: fact.entityId,
        entityName: fact.entityName,
        field: fact.field,
        message: `市场分支将「${fact.field}」从 ${override.value} 覆盖为 ${fact.value}`,
      })
    }
  }
  for (let index = 0; index < facts.length; index += 1) {
    for (let other = index + 1; other < facts.length; other += 1) {
      const left = facts[index]
      const right = facts[other]
      if (
        left.entityId === right.entityId
        && left.field === right.field
        && left.value !== right.value
        && left.validFromEpisode <= right.validToEpisode
        && left.validToEpisode >= right.validFromEpisode
      ) {
        issues.push({
          code: "branch-conflict",
          severity: "error",
          entityId: left.entityId,
          entityName: left.entityName,
          field: left.field,
          message: `分支内「${left.field}」在重叠集数区间出现不同值`,
        })
      }
    }
  }
  return { entities: global.entities, facts, globalFacts: global.facts, issues }
}
