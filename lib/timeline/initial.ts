import type { GeneratedAsset } from "../generation/types.ts"
import type { TimelineClip, TimelinePayload } from "./types.ts"

export const TIMELINE_DURATION_TOLERANCE_MS = 250

function integer(value: unknown, fallback = 0): number {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) ? number : fallback
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizedShot(input: unknown): {
  shotId: string
  shotNumber: number
  scene: string
  expectedDurationMs: number
} | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const shot = input as Record<string, unknown>
  const shotId = text(shot.entityId) || text(shot.id)
  if (!shotId) return null
  const params = shot.params && typeof shot.params === "object"
    ? shot.params as Record<string, unknown>
    : {}
  const durationSeconds = Number(params.duration)
  return {
    shotId,
    shotNumber: Math.max(0, integer(shot.shot)),
    scene: text(shot.scene) || "场景未标注",
    expectedDurationMs: Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.round(durationSeconds * 1000)
      : 0,
  }
}

export function buildInitialTimeline(input: {
  projectId: string
  episode: number
  shots: unknown[]
  videos: GeneratedAsset[]
}): {
  payload: TimelinePayload
  inputHashes: Record<string, string>
} {
  // 同一镜头可能有多次生成，只允许当前采用版本进入时间线；建造时间倒序兜底。
  const selectedByShot = new Map<string, GeneratedAsset>()
  for (const video of [...input.videos]
    .filter((asset) =>
      (asset.mediaKind ?? "image") === "video"
      && asset.targetType === "shot"
      && asset.selectedAt !== null
    )
    .sort((left, right) => right.createdAt - left.createdAt)) {
    if (!selectedByShot.has(video.targetId)) selectedByShot.set(video.targetId, video)
  }

  const clips: TimelineClip[] = []
  const inputHashes: Record<string, string> = {}
  const episode = Math.max(0, integer(input.episode))
  for (const raw of input.shots) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const shot = raw as Record<string, unknown>
    if (Math.max(0, integer(shot.episode)) !== episode) continue
    const normalized = normalizedShot(raw)
    if (!normalized) continue
    const video = selectedByShot.get(normalized.shotId)
    const sourceDurationMs = video?.durationMs && video.durationMs > 0
      ? Math.round(video.durationMs)
      : null
    // 缺镜仍保留在时间线里，让用户看到缺口；只有 ready 才计入可渲染。
    const status: TimelineClip["status"] = !video
      ? "missing-video"
      : sourceDurationMs === null
        ? "missing-duration"
        : normalized.expectedDurationMs > 0
          && Math.abs(sourceDurationMs - normalized.expectedDurationMs) > TIMELINE_DURATION_TOLERANCE_MS
          ? "duration-mismatch"
          : "ready"
    const durationMs = sourceDurationMs ?? normalized.expectedDurationMs
    const reason = status === "missing-video"
      ? "这一镜还没有已采用视频"
      : status === "missing-duration"
        ? "视频缺少可读取的时长"
        : status === "duration-mismatch"
          ? `视频 ${(sourceDurationMs! / 1000).toFixed(2)}s 与分镜 ${(normalized.expectedDurationMs / 1000).toFixed(2)}s 不一致`
          : null
    if (video?.id && video.sha256) inputHashes[video.id] = video.sha256
    clips.push({
      id: `clip:${normalized.shotId}`,
      ...normalized,
      sourceAssetId: video?.id ?? null,
      sourceDurationMs,
      durationMs,
      inMs: 0,
      outMs: durationMs,
      muted: false,
      volume: 1,
      status,
      reason,
    })
  }
  clips.sort((left, right) =>
    left.shotNumber - right.shotNumber || left.shotId.localeCompare(right.shotId)
  )

  const readyCount = clips.filter((clip) => clip.status === "ready").length
  return {
    payload: {
      schemaVersion: 1,
      projectId: input.projectId,
      episode,
      fps: 30,
      clips,
      readyCount,
      blockedCount: clips.length - readyCount,
      totalDurationMs: clips.reduce((sum, clip) => sum + Math.max(0, clip.durationMs), 0),
      subtitle: { enabled: true },
      audio: {
        dialogueVolume: 1,
        bgmAssetId: null,
        bgmVolume: 0.2,
      },
    },
    inputHashes,
  }
}
