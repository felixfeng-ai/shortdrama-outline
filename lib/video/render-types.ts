export type VideoRenderStatus = "queued" | "running" | "succeeded" | "failed"

export interface VideoRender {
  id: string
  projectId: string
  episode: number
  timelineVersionId: string
  timelineRevision: number
  status: VideoRenderStatus
  progress: number
  error: string | null
  durationMs: number | null
  videoStorageKey: string | null
  srtStorageKey: string | null
  manifestStorageKey: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  updatedAt: number
}

export interface VideoRenderDto extends Omit<
  VideoRender,
  "videoStorageKey" | "srtStorageKey" | "manifestStorageKey"
> {
  videoUrl: string | null
  subtitleUrl: string | null
  manifestUrl: string | null
}

export type RenderIssueCode =
  | "timeline-incomplete"
  | "missing-video-asset"
  | "video-hash-mismatch"
  | "missing-audio-asset"
  | "missing-dialogue-audio"
  | "dialogue-duration-missing"
  | "dialogue-overflow"
  | "bgm-license-missing"
  | "empty-timeline"

export interface RenderIssue {
  code: RenderIssueCode
  clipId: string | null
  shotNumber: number | null
  message: string
}

export interface TimelineDialogueLine {
  clipId: string
  shotId: string
  shotNumber: number
  startMs: number
  effectiveDurationMs: number
  speaker: string
  dialogue: string
  muted: boolean
  taskId: string | null
  assetId: string | null
  storageKey: string | null
  previewUrl: string | null
  durationMs: number | null
  overflow: boolean
}

export interface TimelineDialogueInspection {
  lines: TimelineDialogueLine[]
  issues: RenderIssue[]
}
