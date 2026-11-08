export type PublishSubtitleStyle = "clean" | "cinematic" | "bold"

interface SubtitleCue {
  startMs: number
  endMs: number
  text: string
}

interface SubtitleStyleSpec {
  fontSize: number
  primary: string
  outline: string
  outlineWidth: number
  shadow: number
  marginV: number
  bold: number
}

const STYLES: Record<PublishSubtitleStyle, SubtitleStyleSpec> = {
  clean: {
    fontSize: 54, primary: "&H00FFFFFF", outline: "&H00101010",
    outlineWidth: 2, shadow: 0, marginV: 100, bold: 0,
  },
  cinematic: {
    fontSize: 58, primary: "&H00F4F1E8", outline: "&H00101010",
    outlineWidth: 2, shadow: 1, marginV: 120, bold: 0,
  },
  bold: {
    fontSize: 64, primary: "&H00FFFFFF", outline: "&H00000000",
    outlineWidth: 5, shadow: 0, marginV: 84, bold: 1,
  },
}

function timestampToMs(value: string): number {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/)
  if (!match) throw new Error(`字幕时间格式错误：${value}`)
  return Number(match[1]) * 3_600_000
    + Number(match[2]) * 60_000
    + Number(match[3]) * 1_000
    + Number(match[4])
}

function assTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1_000)
  const centiseconds = Math.floor((total % 1_000) / 10)
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`
}

function parseSrt(srt: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const blocks = srt.replace(/\r\n/g, "\n").trim().split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split("\n")
    const timeIndex = lines.findIndex((line) => line.includes("-->"))
    if (timeIndex < 0) continue
    const [start, end] = lines[timeIndex].split("-->").map((part) => part.trim().split(/\s+/)[0])
    const text = lines.slice(timeIndex + 1).join("\n").trim()
    if (!text) continue
    cues.push({
      startMs: timestampToMs(start),
      endMs: timestampToMs(end),
      text,
    })
  }
  return cues
}

function escapeAssText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replace(/\r?\n/g, "\\N")
}

/** 把已经确定的 SRT 转成可烧录 ASS；台词仍以时间线生成的 SRT 为准。 */
export function buildPublishAss(input: {
  srt: string
  style: PublishSubtitleStyle
  width: number
  height: number
}): string {
  const style = STYLES[input.style] ?? STYLES.clean
  const width = Math.max(2, Math.floor(input.width))
  const height = Math.max(2, Math.floor(input.height))
  const cues = parseSrt(input.srt)
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Microsoft YaHei,${style.fontSize},${style.primary},&H00FFFFFF,${style.outline},&H80000000,${style.bold},0,0,0,100,100,0,0,1,${style.outlineWidth},${style.shadow},2,48,48,${style.marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...cues.map((cue) =>
      `Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Default,,0,0,0,,${escapeAssText(cue.text)}`
    ),
    "",
  ].join("\n")
}
