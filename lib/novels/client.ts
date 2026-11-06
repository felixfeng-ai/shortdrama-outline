import { patchJson, postJson, type ApiResponse } from "../api.ts"
import type {
  NovelBudgetEstimate,
  NovelChapterRecord,
  NovelEditionRecord,
  NovelExportFormat,
  NovelPresetId,
  NovelRunRecord,
  NovelVolumeRecord,
} from "./types.ts"
import type { NovelLintIssue, NovelLintReport } from "./lint.ts"

export interface NovelWorkspacePayload {
  edition: NovelEditionRecord
  volumes: NovelVolumeRecord[]
  chapters: NovelChapterRecord[]
  run: NovelRunRecord | null
  upstream: {
    signature: string
    snapshotIds: string[]
    episodeCount: number
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload?.success || payload.data === null) {
    throw new Error(payload?.error || "请求失败，请重试")
  }
  return payload.data
}

export async function fetchNovelEditions(projectId: string): Promise<NovelEditionRecord[]> {
  const data = await getJson<{ editions: NovelEditionRecord[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/novels`,
  )
  return data.editions
}

export async function createNovelEdition(
  projectId: string,
  input: { preset: NovelPresetId; title?: string },
): Promise<{ edition: NovelEditionRecord; estimate: NovelBudgetEstimate }> {
  return postJson(
    `/api/projects/${encodeURIComponent(projectId)}/novels`,
    input,
  )
}

export async function fetchNovelWorkspace(
  projectId: string,
  novelId: string,
): Promise<NovelWorkspacePayload> {
  return getJson(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}`,
  )
}

export async function planNovelGeneration(
  projectId: string,
  novelId: string,
  preset: NovelPresetId,
): Promise<{
  edition: NovelEditionRecord
  estimate: NovelBudgetEstimate
  volumes: NovelVolumeRecord[]
  chapters: NovelChapterRecord[]
}> {
  return postJson(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/plan`,
    { preset },
  )
}

export async function startNovelGeneration(
  projectId: string,
  novelId: string,
  preset: NovelPresetId,
): Promise<{ run: NovelRunRecord; estimate: NovelBudgetEstimate }> {
  return postJson(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/generate`,
    {
      confirmed: true,
      preset,
      idempotencyKey: `novel:${preset}:v1`,
    },
  )
}

export async function pauseNovelGeneration(
  projectId: string,
  novelId: string,
): Promise<{ run: NovelRunRecord | null }> {
  return postJson(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/pause`,
    {},
  )
}

export async function resumeNovelGeneration(
  projectId: string,
  novelId: string,
): Promise<{ run: NovelRunRecord | null }> {
  return postJson(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/resume`,
    {},
  )
}

export async function updateNovelChapter(
  projectId: string,
  novelId: string,
  chapterId: string,
  input: {
    title?: string
    outline?: string
    content?: string
    summary?: string
  },
): Promise<NovelChapterRecord> {
  const data = await patchJson<{ chapter: NovelChapterRecord }>(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}`,
    input,
  )
  return data.chapter
}

export async function regenerateNovelChapter(
  projectId: string,
  novelId: string,
  chapterId: string,
): Promise<NovelChapterRecord> {
  const data = await postJson<{ chapter: NovelChapterRecord }>(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/regenerate`,
    {},
  )
  return data.chapter
}

export async function auditNovelChapter(
  projectId: string,
  novelId: string,
  chapterId: string,
): Promise<{ report: NovelLintReport; chapter: NovelChapterRecord }> {
  return postJson(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/deslop`,
    { mode: "audit" },
  )
}

export async function previewNovelDeslop(
  projectId: string,
  novelId: string,
  chapterId: string,
): Promise<{
  proposed: { content: string; notes: string[] }
  promptVersion: string
  report: NovelLintReport
  chapter: NovelChapterRecord
}> {
  return postJson(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/deslop`,
    { mode: "preview" },
  )
}

export async function applyNovelDeslop(
  projectId: string,
  novelId: string,
  chapterId: string,
  content: string,
): Promise<{ chapter: NovelChapterRecord; report: NovelLintReport }> {
  return postJson(
    `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/deslop`,
    { mode: "apply", content },
  )
}

export function novelExportUrl(
  projectId: string,
  novelId: string,
  format: NovelExportFormat,
): string {
  return `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/export?format=${format}`
}

export type { NovelLintIssue }
