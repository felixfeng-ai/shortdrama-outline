import type { GeneratedAsset, GenerationTask } from "../generation/types.ts"
import type { TimelinePayload } from "../timeline/types.ts"
import type {
  RenderIssue,
  TimelineDialogueInspection,
  TimelineDialogueLine,
} from "./render-types.ts"

export interface TimelineShotInput {
  entityId?: string
  id?: string
  shot?: number | string
  speaker?: string
  dialogue?: string
}

const AUDIO_OVERFLOW_TOLERANCE_MS = 100

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function shotIdentity(shot: TimelineShotInput): string {
  return text(shot.entityId) || text(shot.id)
}

function shotNumber(shot: TimelineShotInput, fallback: number): number {
  const value = Math.floor(Number(shot.shot))
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function shotMap(shots: TimelineShotInput[]): Map<string, TimelineShotInput> {
  return new Map(
    shots
      .map((shot) => [shotIdentity(shot), shot] as const)
      .filter(([id]) => Boolean(id)),
  )
}

function normalizedDialogue(value: unknown): string {
  return text(value).replace(/\s+/g, " ")
}

function latestAudioForShot(
  shotId: string,
  dialogue: string,
  tasks: GenerationTask[],
  assets: GeneratedAsset[],
): { task: GenerationTask; asset: GeneratedAsset } | null {
  const assetByTask = new Map(assets.map((asset) => [asset.taskId, asset]))
  const candidates = tasks
    .filter((task) =>
      task.targetId === shotId
      && task.mediaKind === "audio"
      && task.status === "succeeded"
      && normalizedDialogue(task.prompt) === dialogue
    )
    .sort((left, right) => right.createdAt - left.createdAt)
  for (const task of candidates) {
    const asset = assetByTask.get(task.id)
    if (
      asset
      && asset.mediaKind === "audio"
      && asset.targetId === shotId
      && asset.durationMs !== null
      && asset.durationMs !== undefined
    ) {
      return { task, asset }
    }
  }
  return null
}

export function inspectTimelineDialogue(input: {
  timeline: TimelinePayload
  shots: TimelineShotInput[]
  tasks: GenerationTask[]
  assets: GeneratedAsset[]
  preferredAudioByShot?: Map<string, GeneratedAsset | null>
}): TimelineDialogueInspection {
  const shotsById = shotMap(input.shots)
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]))
  const lines: TimelineDialogueLine[] = []
  const issues: RenderIssue[] = []
  let cursorMs = 0

  for (const clip of input.timeline.clips) {
    const shot = shotsById.get(clip.shotId)
    const dialogue = normalizedDialogue(clip.dialogue ?? shot?.dialogue)
    const effectiveDurationMs = Math.max(0, clip.outMs - clip.inMs)
    const startMs = cursorMs
    cursorMs += effectiveDurationMs
    if (!dialogue) continue

    const speaker = text(clip.speaker ?? shot?.speaker)
    const preferred = input.preferredAudioByShot?.has(clip.shotId)
      ? input.preferredAudioByShot.get(clip.shotId) ?? null
      : undefined
    const selected = preferred === undefined
      ? latestAudioForShot(
          clip.shotId,
          dialogue,
          input.tasks,
          input.assets,
        )
      : preferred
        ? {
            task: tasksById.get(preferred.taskId) ?? ({
              id: preferred.taskId,
            } as GenerationTask),
            asset: preferred,
          }
        : null
    const durationMs = selected?.asset.durationMs ?? null
    const overflow = Boolean(
      !clip.muted
      && durationMs !== null
      && durationMs > effectiveDurationMs + AUDIO_OVERFLOW_TOLERANCE_MS
    )
    const line: TimelineDialogueLine = {
      clipId: clip.id,
      shotId: clip.shotId,
      shotNumber: shotNumber(shot ?? {}, clip.shotNumber),
      startMs,
      effectiveDurationMs,
      speaker,
      dialogue,
      muted: clip.muted,
      taskId: selected?.task.id ?? null,
      assetId: selected?.asset.id ?? null,
      storageKey: selected?.asset.storageKey ?? null,
      previewUrl: selected?.asset.downloadUrl ?? null,
      durationMs,
      overflow,
    }
    lines.push(line)

    if (!clip.muted && !selected) {
      issues.push({
        code: "missing-dialogue-audio",
        clipId: clip.id,
        shotNumber: line.shotNumber,
        message: `第 ${line.shotNumber} 镜有台词，但缺少与当前台词匹配的对白 TTS`,
      })
    } else if (!clip.muted && durationMs === null) {
      issues.push({
        code: "dialogue-duration-missing",
        clipId: clip.id,
        shotNumber: line.shotNumber,
        message: `第 ${line.shotNumber} 镜的对白音频缺少可读取时长`,
      })
    } else if (overflow) {
      issues.push({
        code: "dialogue-overflow",
        clipId: clip.id,
        shotNumber: line.shotNumber,
        message: `第 ${line.shotNumber} 镜对白超出镜头时长：音频 ${(durationMs! / 1000).toFixed(1)}s，镜头 ${(effectiveDurationMs / 1000).toFixed(1)}s`,
      })
    }
  }
  return { lines, issues }
}

function srtTimestamp(milliseconds: number): string {
  const safe = Math.max(0, Math.round(milliseconds))
  const hours = Math.floor(safe / 3_600_000)
  const minutes = Math.floor((safe % 3_600_000) / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1000)
  const millis = safe % 1000
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`
}

export function buildTimelineSrt(input: {
  timeline: TimelinePayload
  shots: TimelineShotInput[]
}): string {
  if (!input.timeline.subtitle.enabled) return ""
  const shotsById = shotMap(input.shots)
  const cues: string[] = []
  let cursorMs = 0
  let index = 1

  for (const clip of input.timeline.clips) {
    const durationMs = Math.max(0, clip.outMs - clip.inMs)
    const startMs = cursorMs
    const endMs = startMs + durationMs
    cursorMs = endMs
    const shot = shotsById.get(clip.shotId)
    const dialogue = normalizedDialogue(clip.dialogue ?? shot?.dialogue)
    if (!dialogue || endMs <= startMs) continue
    const speaker = text(clip.speaker ?? shot?.speaker)
    cues.push(
      String(index),
      `${srtTimestamp(startMs)} --> ${srtTimestamp(endMs)}`,
      speaker ? `${speaker}：${dialogue}` : dialogue,
      "",
    )
    index += 1
  }
  return cues.length > 0 ? `${cues.join("\n")}\n` : ""
}
