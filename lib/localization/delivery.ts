import type { LocalizedEpisode } from "./adapt.ts"
import type { BranchContext, GlossaryEntry } from "./context.ts"

export interface LocalizationDeliveryFile {
  path: string
  kind: "text" | "markdown" | "csv" | "json" | "srt"
  content: string
}

export interface LocalizationDelivery {
  files: LocalizationDeliveryFile[]
  manifest: Record<string, unknown>
}

interface SubtitleLine {
  index: number
  episode: number
  text: string
  startMs: number
  endMs: number
}

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim()
  return `"${text.replace(/"/g, '""')}"`
}

function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

function sentences(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" })
    return [...segmenter.segment(value)].map((part) => part.segment.trim()).filter(Boolean)
  }
  return value.split(/(?<=[.!?。！？])\s+/).map((part) => part.trim()).filter(Boolean)
}

/**
 * 先按句子切，再按单词回退到字符上限。没有空格的文字直接按字符切，
 * 但绝不输出空字幕或把标点单独留成一行。
 */
export function splitSubtitleText(value: string, maxChars: number): string[] {
  const limit = Math.max(10, Math.floor(maxChars))
  const result: string[] = []
  for (const sentence of sentences(value)) {
    if (sentence.length <= limit) {
      if (sentence.trim()) result.push(sentence.trim())
      continue
    }
    const words = sentence.split(/\s+/)
    if (words.length === 1) {
      for (const char of Array.from(sentence)) {
        const last = result[result.length - 1] ?? ""
        if (last.length < limit) result[result.length - 1] = `${last}${char}`
        else result.push(char)
      }
      continue
    }
    let line = ""
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (next.length <= limit) {
        line = next
      } else {
        if (line.trim()) result.push(line.trim())
        if (word.length <= limit) {
          line = word
        } else {
          const chars = Array.from(word)
          while (chars.length > limit) result.push(chars.splice(0, limit).join(""))
          line = chars.join("")
        }
      }
    }
    if (line.trim()) result.push(line.trim())
  }
  return result.filter(Boolean)
}

function srtTime(ms: number): string {
  const safe = Math.max(0, Math.floor(ms))
  const hours = Math.floor(safe / 3_600_000)
  const minutes = Math.floor((safe % 3_600_000) / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1_000)
  const millis = safe % 1_000
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
    + `,${String(millis).padStart(3, "0")}`
}

function subtitleLines(
  items: LocalizedEpisode[],
  context: BranchContext,
): SubtitleLine[] {
  const lines: SubtitleLine[] = []
  let cursor = 0
  for (const item of items) {
    const parts = splitSubtitleText(item.localized, context.subtitle.maxLineChars)
    for (const part of parts) {
      const duration = Math.max(
        context.subtitle.minDurationMs,
        Math.min(
          context.subtitle.maxDurationMs,
          Math.ceil((part.length / context.subtitle.maxCps) * 1_000),
        ),
      )
      lines.push({
        index: lines.length + 1,
        episode: item.episode,
        text: part,
        startMs: cursor,
        endMs: cursor + duration,
      })
      cursor += duration + 120
    }
  }
  return lines
}

export function buildLocalizationDelivery(input: {
  title: string
  projectId: string
  branchId: string
  sourceSnapshotId: string
  context: BranchContext
  glossary: GlossaryEntry[]
  items: LocalizedEpisode[]
  visualNotes?: string[]
  exportedAt?: number
}): LocalizationDelivery {
  const exportedAt = input.exportedAt ?? Date.now()
  const subtitles = subtitleLines(input.items, input.context)
  const srt = subtitles.map((line) =>
    `${line.index}\n${srtTime(line.startMs)} --> ${srtTime(line.endMs)}\n${line.text}\n`
  ).join("\n")
  const subtitleRows: unknown[][] = [[
    "index", "episode", "startMs", "endMs", "durationMs", "text", "charCount",
  ]]
  const dubbingRows: unknown[][] = [[
    "episode", "title", "estimatedWords", "estimatedDurationSeconds", "localizedText", "reason", "risks",
  ]]
  for (const line of subtitles) {
    subtitleRows.push([
      line.index,
      line.episode,
      line.startMs,
      line.endMs,
      line.endMs - line.startMs,
      line.text,
      line.text.length,
    ])
  }
  for (const item of input.items) {
    const words = item.localized.split(/\s+/).filter(Boolean).length
    dubbingRows.push([
      item.episode,
      item.title,
      words,
      Math.ceil((words / input.context.profile.dubbing.wordsPerMinute) * 60),
      item.localized,
      item.reason,
      item.risks.join("；"),
    ])
  }

  const manifest = {
    schema: "chengju.localization-delivery",
    schemaVersion: 1,
    title: input.title,
    projectId: input.projectId,
    branchId: input.branchId,
    sourceSnapshotId: input.sourceSnapshotId,
    market: input.context.profile.market,
    locale: input.context.profile.locale,
    language: input.context.profile.language,
    platforms: input.context.platforms,
    exportedAt,
    episodeCount: input.items.length,
    subtitleCount: subtitles.length,
    glossaryCount: input.glossary.length,
    files: [
      "localized-script.md",
      "localized-episodes.json",
      "subtitles.srt",
      "subtitles.csv",
      "dialogue.csv",
      "dubbing-script.csv",
      "glossary.csv",
      "cultural-notes.md",
      "visual-localization.csv",
      "platform-specs.json",
    ],
  }

  const files: LocalizationDeliveryFile[] = [
    {
      path: "localization/localized-script.md",
      kind: "markdown",
      content: [
        `# ${input.title} · ${input.context.profile.label}`,
        "",
        ...input.items.flatMap((item) => [
          `## Episode ${item.episode} · ${item.title}`,
          "",
          item.localized,
          "",
          `钩子：${item.hook}`,
          "",
          `改编原因：${item.reason}`,
          item.risks.length > 0 ? `风险：${item.risks.join("；")}` : "",
          "",
        ]),
      ].filter((line) => line !== "").join("\n"),
    },
    {
      path: "localization/localized-episodes.json",
      kind: "json",
      content: JSON.stringify({ items: input.items }, null, 2),
    },
    { path: "localization/subtitles.srt", kind: "srt", content: srt },
    { path: "localization/subtitles.csv", kind: "csv", content: csv(subtitleRows) },
    {
      path: "localization/dialogue.csv",
      kind: "csv",
      content: csv([
        ["episode", "localized", "source", "reason"],
        ...input.items.map((item) => [item.episode, item.localized, item.source, item.reason]),
      ]),
    },
    { path: "localization/dubbing-script.csv", kind: "csv", content: csv(dubbingRows) },
    {
      path: "localization/glossary.csv",
      kind: "csv",
      content: csv([
        ["source", "target", "kind", "locked", "notes"],
        ...input.glossary.map((entry) => [
          entry.source,
          entry.target,
          entry.kind,
          entry.locked ? "yes" : "no",
          entry.notes,
        ]),
      ]),
    },
    {
      path: "localization/cultural-notes.md",
      kind: "markdown",
      content: [
        `# ${input.context.profile.label} 本地化说明`,
        "",
        `受众：${input.context.adaptationBrief.audience || "未填写"}`,
        `策略：${input.context.adaptationBrief.strategy || "未填写"}`,
        `红线：${input.context.adaptationBrief.redlines.join("；") || "无"}`,
        "",
        ...input.items.flatMap((item) =>
          item.risks.length > 0
            ? [`- 第 ${item.episode} 集：${item.risks.join("；")}`]
            : []
        ),
      ].join("\n"),
    },
    {
      path: "localization/visual-localization.csv",
      kind: "csv",
      content: csv([
        ["episode", "note"],
        ...(input.visualNotes?.length
          ? input.visualNotes.map((note) => ["all", note])
          : input.context.profile.visualRules.map((note) => ["all", note])),
      ]),
    },
    {
      path: "localization/platform-specs.json",
      kind: "json",
      content: JSON.stringify({
        platforms: input.context.platforms,
        locale: input.context.profile.locale,
        contentRating: input.context.contentRating,
        subtitle: input.context.subtitle,
        dubbing: input.context.profile.dubbing,
        visualRules: input.context.profile.visualRules,
      }, null, 2),
    },
    {
      path: "localization/localization-manifest.json",
      kind: "json",
      content: JSON.stringify(manifest, null, 2),
    },
  ]

  return { files, manifest }
}
