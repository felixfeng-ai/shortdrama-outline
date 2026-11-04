import { postJson, postSse, putJson } from "@/lib/api"
import type { LocalizationBranch } from "./branches"
import type {
  BranchCanonFact,
  BranchCanonIssue,
  BranchContext,
  CanonEntityView,
  GlossaryEntry,
  MarketProfile,
} from "./types-client"
import type { LocalizedEpisode } from "./adapt"
import type { LocalizationAuditReport, SavedLocalizationAudit } from "./audit"
import type {
  LocalizationDeliveryFile,
} from "./delivery"
import type { VisualLocalizationSuggestion } from "./visual"

export type {
  BranchCanonFact,
  BranchCanonIssue,
  BranchContext,
  CanonEntityView,
  GlossaryEntry,
  LocalizationBranch,
  LocalizationDeliveryFile,
  LocalizationAuditReport,
  LocalizedEpisode,
  MarketProfile,
  SavedLocalizationAudit,
  VisualLocalizationSuggestion,
}

export async function fetchLocalizationBranches(projectId: string): Promise<LocalizationBranch[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "海外分支读取失败")
  return payload.data.branches as LocalizationBranch[]
}

export async function createLocalizationBranch(
  projectId: string,
  input: {
    name: string
    baseSnapshotId: string
    market: string
    locale: string
    sourceLanguage?: string
  },
): Promise<LocalizationBranch> {
  return postJson<{ branch: LocalizationBranch }>(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches`,
    input,
  ).then((data) => data.branch)
}

export async function fetchLocalizationContext(
  projectId: string,
  branchId: string,
): Promise<BranchContext | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/context`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "本地化上下文读取失败")
  return payload.data.context as BranchContext | null
}

export async function saveLocalizationContext(
  projectId: string,
  branchId: string,
  input: Record<string, unknown>,
): Promise<BranchContext> {
  return putJson<{ context: BranchContext }>(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/context`,
    input,
  ).then((data) => data.context)
}

export async function fetchLocalizationGlossary(
  projectId: string,
  branchId: string,
): Promise<GlossaryEntry[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/glossary`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "本地化术语读取失败")
  return payload.data.glossary as GlossaryEntry[]
}

export async function saveLocalizationGlossary(
  projectId: string,
  branchId: string,
  input: Record<string, unknown>,
): Promise<GlossaryEntry> {
  return putJson<{ entry: GlossaryEntry }>(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/glossary`,
    input,
  ).then((data) => data.entry)
}

export async function fetchLocalizationCanon(
  projectId: string,
  branchId: string,
): Promise<{
  entities: CanonEntityView[]
  facts: BranchCanonFact[]
  issues: BranchCanonIssue[]
}> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/canon`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "分支 Canon 读取失败")
  return payload.data.canon
}

export async function saveBranchCanonFact(
  projectId: string,
  branchId: string,
  input: Record<string, unknown>,
): Promise<BranchCanonFact> {
  return postJson<{ fact: BranchCanonFact }>(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/canon`,
    input,
  ).then((data) => data.fact)
}

export async function runLocalizationAdaptation(
  projectId: string,
  branchId: string,
  input: { sourceSnapshotId: string; resume?: boolean },
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  return postSse(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/localize`,
    input,
    onEvent,
    signal,
  )
}

export async function confirmLocalizedEpisodes(
  projectId: string,
  branchId: string,
  input: { sourceSnapshotId: string; items: LocalizedEpisode[] },
): Promise<{ id: string; version: number; branchId: string }> {
  return postJson<{ snapshot: { id: string; version: number; branchId: string } }>(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/confirm`,
    input,
  ).then((data) => data.snapshot)
}

export async function runLocalizationAudit(
  projectId: string,
  branchId: string,
  input: { sourceSnapshotId: string; items: LocalizedEpisode[] },
): Promise<SavedLocalizationAudit> {
  return postJson<{ audit: SavedLocalizationAudit }>(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/audit`,
    input,
  ).then((data) => data.audit)
}

export async function fetchLatestLocalizationAudit(
  projectId: string,
  branchId: string,
): Promise<SavedLocalizationAudit | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/audit`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "本地化审计读取失败")
  return payload.data.audit as SavedLocalizationAudit | null
}

export async function analyzeLocalizationVisuals(
  projectId: string,
  branchId: string,
): Promise<{ suggestions: VisualLocalizationSuggestion[]; sourceSnapshotId: string }> {
  return postJson<{ suggestions: VisualLocalizationSuggestion[]; sourceSnapshotId: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/visual`,
    {},
  )
}

export async function commitLocalizationVisuals(
  projectId: string,
  branchId: string,
  suggestions: VisualLocalizationSuggestion[],
): Promise<{ id: string; version: number; branchId: string }> {
  return postJson<{ snapshot: { id: string; version: number; branchId: string } }>(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/visual`,
    { commit: true, suggestions },
  ).then((data) => data.snapshot)
}

export async function buildLocalizationDelivery(
  projectId: string,
  branchId: string,
  input: {
    title: string
    sourceSnapshotId: string
    items: LocalizedEpisode[]
    visualNotes?: string[]
  },
): Promise<{
  files: LocalizationDeliveryFile[]
  manifest: Record<string, unknown>
}> {
  return postJson(
    `/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branchId)}/delivery`,
    input,
  )
}

export async function fetchLocalizationBackup(projectId: string): Promise<unknown> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/localization/backup`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "本地化备份读取失败")
  return payload.data.localization
}
