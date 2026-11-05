import type { VideoRender, VideoRenderDto } from "./render-types.ts"

export function toVideoRenderDto(render: VideoRender): VideoRenderDto {
  const query = new URLSearchParams({ projectId: render.projectId })
  const base = `/api/video/renders/${encodeURIComponent(render.id)}`
  const ready = render.status === "succeeded"
  return {
    id: render.id,
    projectId: render.projectId,
    episode: render.episode,
    timelineVersionId: render.timelineVersionId,
    timelineRevision: render.timelineRevision,
    status: render.status,
    progress: render.progress,
    error: render.error,
    durationMs: render.durationMs,
    videoUrl: ready ? `${base}/file?${query.toString()}` : null,
    subtitleUrl: ready ? `${base}/subtitle?${query.toString()}` : null,
    manifestUrl: ready ? `${base}/manifest?${query.toString()}` : null,
    createdAt: render.createdAt,
    startedAt: render.startedAt,
    finishedAt: render.finishedAt,
    updatedAt: render.updatedAt,
  }
}
