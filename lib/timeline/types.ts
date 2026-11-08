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
  // 固化版本保留台词快照；旧版本重渲时不能读取后来改过的分镜文本。
  speaker?: string
  dialogue?: string
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
    style?: "clean" | "cinematic" | "bold"
  }
  video?: {
    transition?: "cut" | "fade"
    transitionDurationMs?: number
  }
  audio: {
    dialogueVolume: 1
    bgmAssetId: string | null
    bgmVolume: number
    bgmFadeInMs?: number
    bgmFadeOutMs?: number
    bgmDucking?: boolean
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
