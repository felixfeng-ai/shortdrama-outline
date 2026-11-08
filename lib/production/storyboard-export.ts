import type { StoryboardSegment } from "./storyboard-preview.ts"
import { countSpeechCharacters, estimateSpeechCostMicros } from "../audio/tts-model.ts"

export interface StoryboardExportQuote {
  voiceover: {
    available: boolean
    characterCount: number
    estimatedCostMicros: number | null
    reason: string | null
  }
}

export function buildStoryboardExportQuote(input: {
  segments: StoryboardSegment[]
  ttsAvailable: boolean
  pricePer1kCharsMicros: number | null
}): StoryboardExportQuote {
  const characterCount = input.segments.reduce(
    (sum, segment) => sum + countSpeechCharacters(segment.dialogue),
    0,
  )
  const available = input.ttsAvailable && input.pricePer1kCharsMicros !== null
  return {
    voiceover: {
      available,
      characterCount,
      estimatedCostMicros: available
        ? estimateSpeechCostMicros({
            characters: characterCount,
            pricePer1kCharsMicros: input.pricePer1kCharsMicros!,
          })
        : null,
      reason: available
        ? null
        : "自动配音未启用或未配置价格；仍可导出字幕与系统 BGM。",
    },
  }
}

function timestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor(total % 3_600_000 / 60_000)
  const seconds = Math.floor(total % 60_000 / 1_000)
  const millis = total % 1_000
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`,
  ].join(":")
}

export function buildStoryboardSrt(segments: StoryboardSegment[]): string {
  let cursorMs = 0
  const blocks: string[] = []
  segments.forEach((segment, index) => {
    const startMs = cursorMs
    const endMs = startMs + Math.max(0, segment.durationSeconds * 1_000 - 300)
    const text = segment.dialogue.trim()
    if (text) {
      blocks.push([
        String(index + 1),
        `${timestamp(startMs)} --> ${timestamp(endMs)}`,
        segment.speaker ? `${segment.speaker}：${text}` : text,
      ].join("\r\n"))
    }
    cursorMs += segment.durationSeconds * 1_000
  })
  return blocks.length > 0 ? `${blocks.join("\r\n\r\n")}\r\n` : ""
}
