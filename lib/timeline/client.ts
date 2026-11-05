import { postJson, putJson } from "../api.ts"
import type { TimelineDraft, TimelinePayload, TimelineVersion } from "./types.ts"

export interface TimelineState {
  draft: TimelineDraft | null
  versions: TimelineVersion[]
}

export interface TimelineVersionSummary {
  episode: number
  versionId: string
  revision: number
  readyCount: number
  blockedCount: number
  issueCount: number
  totalDurationMs: number
}

function endpoint(projectId: string, episode: number): string {
  const params = new URLSearchParams({ projectId })
  return `/api/timelines/${episode}?${params.toString()}`
}

export async function fetchTimeline(
  projectId: string,
  episode: number,
): Promise<TimelineState> {
  const response = await fetch(endpoint(projectId, episode))
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "时间线读取失败")
  }
  return payload.data as TimelineState
}

export function initializeTimeline(
  projectId: string,
  episode: number,
): Promise<{ draft: TimelineDraft; created: boolean }> {
  return postJson(`/api/timelines/${episode}`, { projectId })
}

export function saveTimelineDraft(input: {
  projectId: string
  episode: number
  expectedRevision: number
  payload: TimelinePayload
}): Promise<{ draft: TimelineDraft }> {
  return putJson(`/api/timelines/${input.episode}/draft`, {
    projectId: input.projectId,
    expectedRevision: input.expectedRevision,
    payload: input.payload,
  })
}

export function freezeTimelineVersion(input: {
  projectId: string
  episode: number
  expectedRevision: number
}): Promise<{ version: TimelineVersion }> {
  return postJson(`/api/timelines/${input.episode}/versions`, {
    projectId: input.projectId,
    expectedRevision: input.expectedRevision,
  })
}

export async function fetchLatestTimelineVersions(
  projectId: string,
): Promise<TimelineVersionSummary[]> {
  const params = new URLSearchParams({ projectId })
  const response = await fetch(`/api/timelines?${params.toString()}`, {
    cache: "no-store",
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "时间线版本读取失败")
  }
  return payload.data.versions as TimelineVersionSummary[]
}
