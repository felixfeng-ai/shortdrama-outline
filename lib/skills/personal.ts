import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { createProjectJudgment } from "../assets/decisions.ts"

export interface PersonalSkillVersion {
  id: string
  skillId: string
  version: number
  mainDoc: string
  references: string[]
  stageRules: Record<string, string>
  acceptance: string[]
  changeNote: string
  createdAt: number
}

export interface PersonalSkill {
  id: string
  ownerId: string
  name: string
  summary: string
  currentVersion: number
  status: "active" | "archived"
  createdAt: number
  updatedAt: number
  latestVersion: PersonalSkillVersion
  versions: PersonalSkillVersion[]
}

export interface ProjectSkillBinding {
  projectId: string
  skillId: string
  skillVersion: number
  appliedBy: string
  appliedAt: number
  name: string
  summary: string
  stageRules: Record<string, string>
  acceptance: string[]
  mainDoc: string
}

interface SkillRow {
  id: string
  owner_id: string
  name: string
  summary: string
  current_version: number
  status: string
  created_at: number
  updated_at: number
}

interface VersionRow {
  id: string
  skill_id: string
  version: number
  main_doc: string
  references_json: string
  stage_rules_json: string
  acceptance_json: string
  change_note: string
  created_at: number
}

interface BindingRow {
  project_id: string
  skill_id: string
  skill_version: number
  applied_by: string
  applied_at: number
  name: string
  summary: string
  stage_rules_json: string
  acceptance_json: string
  main_doc: string
}

export interface PersonalSkillInput {
  name?: unknown
  summary?: unknown
  mainDoc?: unknown
  references?: unknown
  stageRules?: unknown
  acceptance?: unknown
  changeNote?: unknown
}

function text(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : ""
}

function documentText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .map((item) => text(item, maxLength))
      .filter(Boolean),
  )].slice(0, maxItems)
}

function stageRules(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = text(key, 40)
    const rule = text(raw, 500)
    if (name && rule) result[name] = rule
  }
  return result
}

function parseStringList(value: string, maxItems: number, maxLength: number): string[] {
  try {
    return stringList(JSON.parse(value), maxItems, maxLength)
  } catch {
    return []
  }
}

function parseStageRules(value: string): Record<string, string> {
  try {
    return stageRules(JSON.parse(value))
  } catch {
    return {}
  }
}

function versionRow(row: VersionRow): PersonalSkillVersion {
  return {
    id: row.id,
    skillId: row.skill_id,
    version: Number(row.version),
    mainDoc: row.main_doc,
    references: parseStringList(row.references_json, 20, 400),
    stageRules: parseStageRules(row.stage_rules_json),
    acceptance: parseStringList(row.acceptance_json, 20, 240),
    changeNote: row.change_note,
    createdAt: Number(row.created_at),
  }
}

function skillId(prefix: string, now: number): string {
  return `${prefix}_${now}_${Math.random().toString(36).slice(2, 9)}`
}

function normalizedInput(input: PersonalSkillInput): {
  name: string
  summary: string
  mainDoc: string
  references: string[]
  stageRules: Record<string, string>
  acceptance: string[]
} {
  const name = text(input.name, 80)
  const summary = text(input.summary, 400)
  const mainDoc = documentText(input.mainDoc, 30_000)
  if (!name) throw new InputError("Skill 名称不能为空")
  if (!mainDoc) throw new InputError("Skill 主文档不能为空")
  return {
    name,
    summary,
    mainDoc,
    references: stringList(input.references, 20, 400),
    stageRules: stageRules(input.stageRules),
    acceptance: stringList(input.acceptance, 20, 240),
  }
}

function getSkillRow(
  db: DatabaseSync,
  ownerId: string,
  skillIdValue: string,
): SkillRow | null {
  const row = db.prepare(
    "SELECT * FROM personal_skills WHERE id = ? AND owner_id = ?",
  ).get(skillIdValue, ownerId) as SkillRow | undefined
  return row ?? null
}

function versionsForSkill(
  db: DatabaseSync,
  skillIdValue: string,
): PersonalSkillVersion[] {
  return (db.prepare(
    `SELECT * FROM personal_skill_versions
     WHERE skill_id = ?
     ORDER BY version ASC`,
  ).all(skillIdValue) as VersionRow[]).map(versionRow)
}

function mapSkill(
  db: DatabaseSync,
  row: SkillRow,
  includeVersions = true,
): PersonalSkill {
  const versions = includeVersions ? versionsForSkill(db, row.id) : []
  const latest = versions.find((item) => item.version === Number(row.current_version))
    ?? versionRow(db.prepare(
      "SELECT * FROM personal_skill_versions WHERE skill_id = ? AND version = ?",
    ).get(row.id, row.current_version) as VersionRow)
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    summary: row.summary,
    currentVersion: Number(row.current_version),
    status: row.status === "archived" ? "archived" : "active",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    latestVersion: latest,
    versions,
  }
}

/**
 * 创建 Skill 和 v1 必须在同一事务内完成。
 * 如果只写主表不写版本，项目绑定会指向不存在的规则；失败时整体回滚。
 */
export function createPersonalSkill(
  db: DatabaseSync,
  ownerId: string,
  input: PersonalSkillInput,
  now = Date.now(),
): PersonalSkill {
  const normalized = normalizedInput(input)
  const exists = db.prepare(
    "SELECT id FROM personal_skills WHERE owner_id = ? AND name = ?",
  ).get(ownerId, normalized.name)
  if (exists) throw new InputError("同名 Skill 已存在，请直接发布新版本")

  const id = skillId("skill", now)
  const versionId = skillId("skillv", now)
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO personal_skills
        (id, owner_id, name, summary, current_version, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 'active', ?, ?)`,
    ).run(id, ownerId, normalized.name, normalized.summary, now, now)
    db.prepare(
      `INSERT INTO personal_skill_versions
        (id, skill_id, version, main_doc, references_json, stage_rules_json,
         acceptance_json, change_note, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    ).run(
      versionId,
      id,
      normalized.mainDoc,
      JSON.stringify(normalized.references),
      JSON.stringify(normalized.stageRules),
      JSON.stringify(normalized.acceptance),
      text((input as { changeNote?: unknown }).changeNote, 240),
      now,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return mapSkill(db, getSkillRow(db, ownerId, id)!)
}

export function listPersonalSkills(db: DatabaseSync, ownerId: string): PersonalSkill[] {
  return (db.prepare(
    `SELECT * FROM personal_skills
     WHERE owner_id = ? AND status = 'active'
     ORDER BY updated_at DESC`,
  ).all(ownerId) as SkillRow[]).map((row) => mapSkill(db, row))
}

export function getPersonalSkill(
  db: DatabaseSync,
  ownerId: string,
  skillIdValue: string,
): PersonalSkill | null {
  const row = getSkillRow(db, ownerId, skillIdValue)
  return row ? mapSkill(db, row) : null
}

/**
 * 发布新版本不覆盖旧版本：历史项目、判断日志和导出都依赖当时采用的规则。
 * 主表 current_version 与版本明细在同一事务中更新，避免列表显示 v3 却读不到 v3。
 */
export function publishPersonalSkillVersion(
  db: DatabaseSync,
  ownerId: string,
  skillIdValue: string,
  input: PersonalSkillInput,
  now = Date.now(),
): PersonalSkill {
  const current = getSkillRow(db, ownerId, skillIdValue)
  if (!current) throw new InputError("Skill 不存在或无权访问")
  const normalized = normalizedInput(input)
  const nextVersion = Number(current.current_version) + 1
  const versionId = skillId("skillv", now)
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO personal_skill_versions
        (id, skill_id, version, main_doc, references_json, stage_rules_json,
         acceptance_json, change_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      versionId,
      skillIdValue,
      nextVersion,
      normalized.mainDoc,
      JSON.stringify(normalized.references),
      JSON.stringify(normalized.stageRules),
      JSON.stringify(normalized.acceptance),
      text((input as { changeNote?: unknown }).changeNote, 240),
      now,
    )
    db.prepare(
      `UPDATE personal_skills
       SET name = ?, summary = ?, current_version = ?, updated_at = ?
       WHERE id = ? AND owner_id = ?`,
    ).run(normalized.name, normalized.summary, nextVersion, now, skillIdValue, ownerId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getPersonalSkill(db, ownerId, skillIdValue)!
}

/**
 * 项目绑定只在确认后调用。这里同时校验 owner 和具体版本，防止把别人 Skill
 * 或当前 Skill 的未来版本写入项目。绑定项目本身的存在性由上层 API 先校验。
 */
export function applySkillToProject(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  skillIdValue: string,
  version: number,
  now = Date.now(),
): ProjectSkillBinding {
  const skill = getSkillRow(db, ownerId, skillIdValue)
  if (!skill) throw new InputError("Skill 不存在或无权访问")
  const versionRowData = db.prepare(
    `SELECT * FROM personal_skill_versions
     WHERE skill_id = ? AND version = ?`,
  ).get(skillIdValue, version) as VersionRow | undefined
  if (!versionRowData) throw new InputError("Skill 版本不存在")
  const prior = getProjectSkillBinding(db, projectId)

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO project_skill_bindings
        (project_id, skill_id, skill_version, applied_by, applied_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         skill_id = excluded.skill_id,
         skill_version = excluded.skill_version,
         applied_by = excluded.applied_by,
         applied_at = excluded.applied_at`,
    ).run(projectId, skillIdValue, version, ownerId, now)
    if (!prior || prior.skillId !== skillIdValue || prior.skillVersion !== version) {
      createProjectJudgment(db, projectId, ownerId, {
        step: "characters",
        action: "采用创作方法 Skill",
        reason: `${skill.name} v${version}`,
      }, now)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getProjectSkillBinding(db, projectId)!
}

export function getProjectSkillBinding(
  db: DatabaseSync,
  projectId: string,
): ProjectSkillBinding | null {
  const row = db.prepare(
    `SELECT b.project_id, b.skill_id, b.skill_version, b.applied_by, b.applied_at,
            s.name, s.summary, v.main_doc, v.stage_rules_json, v.acceptance_json
     FROM project_skill_bindings b
     JOIN personal_skills s ON s.id = b.skill_id
     JOIN personal_skill_versions v
       ON v.skill_id = b.skill_id AND v.version = b.skill_version
     WHERE b.project_id = ?`,
  ).get(projectId) as BindingRow | undefined
  if (!row) return null
  return {
    projectId: row.project_id,
    skillId: row.skill_id,
    skillVersion: Number(row.skill_version),
    appliedBy: row.applied_by,
    appliedAt: Number(row.applied_at),
    name: row.name,
    summary: row.summary,
    stageRules: parseStageRules(row.stage_rules_json),
    acceptance: parseStringList(row.acceptance_json, 20, 240),
    mainDoc: row.main_doc,
  }
}
