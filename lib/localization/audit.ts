import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import type { BranchCanonIssue, BranchContext, GlossaryEntry } from "./context.ts"
import type { LocalizedEpisode } from "./adapt.ts"

export type LocalizationAuditCode =
  | "glossary-miss"
  | "banned-expression"
  | "subtitle-too-long"
  | "canon-conflict"
  | "visual-text-risk"
  | "model-review"

export interface LocalizationAuditIssue {
  code: LocalizationAuditCode
  severity: "blocking" | "warning"
  episode: number
  field: string
  message: string
  evidence: string
  suggestion: string
}

export interface LocalizationAuditReport {
  schema: "chengju.localization-audit"
  schemaVersion: 1
  projectId: string
  branchId: string
  blocking: number
  warning: number
  issues: LocalizationAuditIssue[]
  checkedAt: number
}

export interface SavedLocalizationAudit extends LocalizationAuditReport {
  id: string
  sourceSnapshotId: string
}

interface AuditRow {
  id: string
  project_id: string
  branch_id: string
  owner_id: string
  source_snapshot_id: string
  report_json: string
  blocking: number
  warnings: number
  created_at: number
}

function sentences(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" })
    return [...segmenter.segment(value)].map((part) => part.segment.trim()).filter(Boolean)
  }
  return value.split(/(?<=[.!?。！？])\s+/).map((part) => part.trim()).filter(Boolean)
}

export function auditLocalization(input: {
  projectId: string
  branchId: string
  context: BranchContext
  glossary: GlossaryEntry[]
  items: LocalizedEpisode[]
  canonIssues?: BranchCanonIssue[]
  modelIssues?: Array<Partial<LocalizationAuditIssue> & { message: string }>
  now?: number
}): LocalizationAuditReport {
  const issues: LocalizationAuditIssue[] = []
  const maxLineChars = input.context.subtitle.maxLineChars

  for (const item of input.items) {
    for (const entry of input.glossary) {
      if (!entry.locked) continue
      if (!item.source.includes(entry.source)) continue
      const contains = entry.caseSensitive
        ? item.localized.includes(entry.target)
        : item.localized.toLocaleLowerCase().includes(entry.target.toLocaleLowerCase())
      if (!contains) {
        issues.push({
          code: "glossary-miss",
          severity: "blocking",
          episode: item.episode,
          field: "localized",
          message: `锁定术语「${entry.source}」没有使用指定译法「${entry.target}」`,
          evidence: item.localized.slice(0, 240),
          suggestion: `改为使用 ${entry.target}`,
        })
      }
    }

    const localizedLower = item.localized.toLocaleLowerCase()
    for (const banned of input.context.adaptationBrief.redlines) {
      if (banned && localizedLower.includes(banned.toLocaleLowerCase())) {
        issues.push({
          code: "banned-expression",
          severity: "blocking",
          episode: item.episode,
          field: "localized",
          message: `命中市场红线「${banned}」`,
          evidence: banned,
          suggestion: "改写该句并重新运行本地化审计",
        })
      }
    }

    for (const line of sentences(item.localized)) {
      if (line.length > maxLineChars) {
        issues.push({
          code: "subtitle-too-long",
          severity: "warning",
          episode: item.episode,
          field: "localized",
          message: `字幕句长 ${line.length} 超过 ${maxLineChars} 字符上限`,
          evidence: line.slice(0, 240),
          suggestion: "拆成更短的句子或降低信息密度",
        })
      }
    }
  }

  for (const issue of input.canonIssues ?? []) {
    issues.push({
      code: "canon-conflict",
      severity: issue.severity === "error" ? "blocking" : "warning",
      episode: 0,
      field: issue.field,
      message: issue.message,
      evidence: issue.entityName,
      suggestion: "确认市场 Canon 覆盖或修正冲突事实",
    })
  }

  for (const issue of input.modelIssues ?? []) {
    issues.push({
      code: issue.code ?? "model-review",
      severity: issue.severity === "blocking" ? "blocking" : "warning",
      episode: Number.isInteger(issue.episode) ? Number(issue.episode) : 0,
      field: issue.field ?? "localized",
      message: issue.message,
      evidence: issue.evidence ?? "",
      suggestion: issue.suggestion ?? "人工确认该审校建议",
    })
  }

  return {
    schema: "chengju.localization-audit",
    schemaVersion: 1,
    projectId: input.projectId,
    branchId: input.branchId,
    blocking: issues.filter((issue) => issue.severity === "blocking").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    issues,
    checkedAt: input.now ?? Date.now(),
  }
}

function parseReport(row: AuditRow): SavedLocalizationAudit {
  let report: LocalizationAuditReport
  try {
    report = JSON.parse(row.report_json) as LocalizationAuditReport
  } catch {
    report = {
      schema: "chengju.localization-audit",
      schemaVersion: 1,
      projectId: row.project_id,
      branchId: row.branch_id,
      blocking: Number(row.blocking),
      warning: Number(row.warnings),
      issues: [],
      checkedAt: Number(row.created_at),
    }
  }
  return { ...report, id: row.id, sourceSnapshotId: row.source_snapshot_id }
}

export function saveLocalizationAudit(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
  sourceSnapshotId: string,
  report: LocalizationAuditReport,
  now = Date.now(),
): SavedLocalizationAudit {
  const id = `audit_${randomUUID()}`
  db.prepare(
    `INSERT INTO localization_audits
      (id, project_id, branch_id, owner_id, source_snapshot_id,
       report_json, blocking, warnings, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    branchId,
    ownerId,
    sourceSnapshotId,
    JSON.stringify(report),
    report.blocking,
    report.warning,
    now,
  )
  return parseReport(db.prepare(
    "SELECT * FROM localization_audits WHERE id = ?",
  ).get(id) as AuditRow)
}

export function getLatestLocalizationAudit(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
): SavedLocalizationAudit | null {
  const row = db.prepare(
    `SELECT * FROM localization_audits
     WHERE project_id = ? AND branch_id = ? AND owner_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
  ).get(projectId, branchId, ownerId) as AuditRow | undefined
  return row ? parseReport(row) : null
}
