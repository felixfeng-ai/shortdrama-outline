export type TimelineClipStatus =
  | "ready"
  | "missing-video"
  | "missing-duration"
  | "duration-mismatch"

export interface TimelineClip {
  id: string
  shotId: string
  shotNumber: number
  scene: string
  sourceAssetId: string | null
  sourceDurationMs: number | null
  durationMs: number
  expectedDurationMs: number
  inMs: number
  outMs: number
  muted: boolean
  volume: number
  status: TimelineClipStatus
  reason: string | null
}

export interface TimelinePayload {
  schemaVersion: 1
  projectId: string
  episode: number
  fps: 30
  clips: TimelineClip[]
  readyCount: number
  blockedCount: number
  totalDurationMs: number
  subtitle: {
    enabled: true
  }
  audio: {
    dialogueVolume: 1
    bgmAssetId: null
    bgmVolume: 0.2
  }
}

export interface TimelineDraft {
  id: string
  projectId: string
  episode: number
  revision: number
  payload: TimelinePayload
  createdAt: number
  updatedAt: number
}

export interface TimelineVersion {
  id: string
  projectId: string
  episode: number
  revision: number
  payload: TimelinePayload
  inputHashes: Record<string, string>
  createdAt: number
}
