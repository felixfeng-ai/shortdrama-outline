import { postJson } from "../api.ts"
import type {
  RenderExportPreset,
  RenderQualityProfile,
  VideoRenderApproval,
  VideoRenderDto,
} from "./render-types.ts"
import type { TimelineVersion } from "../timeline/types.ts"

async function renderList(url: string): Promise<VideoRenderDto[]> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "渲染任务读取失败")
  }
  return payload.data.renders as VideoRenderDto[]
}

export function fetchVideoRenders(
  projectId: string,
  episode: number,
): Promise<VideoRenderDto[]> {
  const query = new URLSearchParams({
    projectId,
    episode: String(episode),
  })
  return renderList(`/api/video/renders?${query.toString()}`)
}

export function enqueueVideoRender(input: {
  projectId: string
  episode: number
  timelineVersionId: string
  qualityProfile?: RenderQualityProfile
  exportPreset?: RenderExportPreset
}): Promise<{ render: VideoRenderDto; created: boolean }> {
  return postJson("/api/video/renders", input)
}

export function enqueueFrozenEpisodeQueue(input: {
  projectId: string
  episodes: number[]
}): Promise<{
  renders: VideoRenderDto[]
  blocked: Array<{ episode: number; reason: string }>
}> {
  return postJson("/api/video/renders/batch", input)
}

export function smartRenderEpisode(input: {
  projectId: string
  episode: number
  qualityProfile: RenderQualityProfile
  exportPreset: RenderExportPreset
}): Promise<{
  render: VideoRenderDto
  version: TimelineVersion
  qualityProfile: RenderQualityProfile
  exportPreset: RenderExportPreset
  adoptedVideoCount: number
  generatedTtsCount: number
  warnings: string[]
  bgmTrackId: string | null
  quotaUnits: number
}> {
  return postJson("/api/video/smart-render", input)
}

export function updateRenderApproval(input: {
  projectId: string
  renderId: string
  action: "request" | "approve" | "request_changes"
  note?: string
}): Promise<VideoRenderApproval> {
  return postJson<{ approval: VideoRenderApproval }>(
    `/api/video/renders/${encodeURIComponent(input.renderId)}/approval`,
    input,
  ).then((result) => result.approval)
}
