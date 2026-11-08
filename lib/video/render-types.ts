export type VideoRenderStatus = "queued" | "running" | "succeeded" | "failed"
export type RenderQualityProfile = "preview" | "delivery"
export type RenderExportPreset = "vertical" | "landscape" | "square"

export interface VideoRender {
  id: string
  projectId: string
  episode: number
  timelineVersionId: string
  timelineRevision: number
  qualityProfile: RenderQualityProfile
  exportPreset: RenderExportPreset
  status: VideoRenderStatus
  progress: number
  error: string | null
  durationMs: number | null
  videoStorageKey: string | null
  srtStorageKey: string | null
  manifestStorageKey: string | null
  quotaReservationId: string | null
  quotaUnits: number
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  updatedAt: number
}

export interface VideoRenderDto extends Omit<
  VideoRender,
  "videoStorageKey" | "srtStorageKey" | "manifestStorageKey" | "quotaReservationId"
> {
  videoUrl: string | null
  subtitleUrl: string | null
  manifestUrl: string | null
  approvalStatus?: "pending" | "approved" | "changes_requested" | null
  approvalNote?: string
  approvalReviewedAt?: number | null
}

export interface VideoRenderApproval {
  renderId: string
  projectId: string
  status: "pending" | "approved" | "changes_requested"
  note: string
  requestedAt: number
  reviewedAt: number | null
  reviewerLabel: string
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
