import type { Shot } from "../assets/types.ts"
import type { GeneratedAsset } from "../generation/types.ts"
import { selectedShotMedia } from "./selected-media.ts"

const IMAGE_SEGMENT_SECONDS = 6
const TARGET_SECONDS = 36
const MIN_SECONDS = 30
const MAX_SECONDS = 45
const MAX_SEGMENTS = 8

export interface StoryboardSegment {
  id: string
  shotId: string
  episode: number
  shot: number
  mediaKind: "image" | "video"
  mediaUrl: string
  durationSeconds: number
  speaker: string
  dialogue: string
  action: string
  characters: string[]
}

export interface StoryboardPreviewPlan {
  projectId: string
  status: "ready" | "insufficient"
  minDurationSeconds: number
  maxDurationSeconds: number
  totalDurationSeconds: number
  segmentCount: number
  imageSegments: number
  videoSegments: number
  skippedShots: number
  message: string
  segments: StoryboardSegment[]
}

interface StoryboardPreviewInput {
  projectId: string
  shots: Shot[]
  assets: GeneratedAsset[]
}

function segmentDuration(
  shot: Shot,
  mediaKind: "image" | "video",
  asset: GeneratedAsset,
): number {
  if (mediaKind === "image") return IMAGE_SEGMENT_SECONDS
  const assetSeconds = asset.durationMs && asset.durationMs > 0
    ? Math.round(asset.durationMs / 1_000)
    : shot.params.duration
  return Math.max(2, Math.min(10, Math.round(assetSeconds)))
}

export function buildStoryboardPreviewPlan(
  input: StoryboardPreviewInput,
): StoryboardPreviewPlan {
  const media = selectedShotMedia(input.shots, input.assets)
  const orderedShots = [...input.shots].sort(
    (left, right) => left.episode - right.episode || left.shot - right.shot,
  )
  const segments: StoryboardSegment[] = []
  let totalDurationSeconds = 0

  for (const shot of orderedShots) {
    if (segments.length >= MAX_SEGMENTS || totalDurationSeconds >= TARGET_SECONDS) break
    const selected = media.get(shot.id)
    const asset = selected?.video ?? selected?.image
    if (!asset) continue
    const mediaKind = selected?.video ? "video" : "image"
    const planned = segmentDuration(shot, mediaKind, asset)
    const remaining = MAX_SECONDS - totalDurationSeconds
    if (remaining <= 0) break
    const durationSeconds = Math.min(planned, remaining)
    if (durationSeconds < 1) continue
    segments.push({
      id: `${shot.id}:${asset.id}`,
      shotId: shot.id,
      episode: shot.episode,
      shot: shot.shot,
      mediaKind,
      mediaUrl: asset.downloadUrl,
      durationSeconds,
      speaker: shot.speaker,
      dialogue: shot.dialogue,
      action: shot.action,
      characters: shot.characters,
    })
    totalDurationSeconds += durationSeconds
  }

  const status = totalDurationSeconds >= MIN_SECONDS ? "ready" : "insufficient"
  return {
    projectId: input.projectId,
    status,
    minDurationSeconds: MIN_SECONDS,
    maxDurationSeconds: MAX_SECONDS,
    totalDurationSeconds,
    segmentCount: segments.length,
    imageSegments: segments.filter((segment) => segment.mediaKind === "image").length,
    videoSegments: segments.filter((segment) => segment.mediaKind === "video").length,
    skippedShots: Math.max(0, orderedShots.length - segments.length),
    message: status === "ready"
      ? `由 ${segments.length} 个已采用镜头素材组成。`
      : `当前只有 ${totalDurationSeconds} 秒已采用素材，至少需要 ${MIN_SECONDS} 秒。`,
    segments,
  }
}
