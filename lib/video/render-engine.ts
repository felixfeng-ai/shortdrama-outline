import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

interface BinaryInstaller {
  path: string
}

export interface RenderCommandInput {
  ffmpegPath: string
  outputPath: string
  width: number
  height: number
  fps: number
  totalDurationMs: number
  transition?: {
    type: "cut" | "fade"
    durationMs: number
  }
  clips: Array<{
    inputIndex: number
    inMs: number
    outMs: number
  }>
  dialogue: Array<{
    inputIndex: number
    startMs: number
    volume: number
  }>
  bgm: {
    inputIndex: number
    volume: number
    fadeInMs: number
    fadeOutMs: number
    ducking: boolean
  } | null
}

function bundledBinary(packageName: string): string | null {
  try {
    // 生产构建后模块位于 .next 内，必须从项目根目录解析随包安装的媒体二进制。
    const require = createRequire(path.join(process.cwd(), "package.json"))
    const installer = require(packageName) as BinaryInstaller
    return installer.path || null
  } catch {
    return null
  }
}

function seconds(value: number): string {
  return (Math.max(0, value) / 1000).toFixed(3).replace(/\.?0+$/, "")
}

export function resolveFfmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim()
    || bundledBinary("@ffmpeg-installer/ffmpeg")
    || "ffmpeg"
}

export function resolveFfprobePath(): string {
  return process.env.FFPROBE_PATH?.trim()
    || bundledBinary("@ffprobe-installer/ffprobe")
    || "ffprobe"
}

export function buildFfmpegRenderArgs(input: RenderCommandInput): string[] {
  const width = Math.max(2, Math.floor(input.width / 2) * 2)
  const height = Math.max(2, Math.floor(input.height / 2) * 2)
  const fps = Math.max(1, Math.floor(input.fps))
  const total = seconds(input.totalDurationMs)
  const filters: string[] = []
  const videoLabels: string[] = []

  input.clips.forEach((clip, index) => {
    const label = `v${index}`
    const durationMs = Math.max(1, clip.outMs - clip.inMs)
    const transitionMs = input.transition?.type === "fade"
      ? Math.min(
          Math.max(0, input.transition.durationMs),
          Math.max(0, durationMs / 2),
        )
      : 0
    const fadeFilter = transitionMs > 0
      ? `fade=t=in:st=0:d=${seconds(transitionMs)},`
        + `fade=t=out:st=${seconds(Math.max(0, durationMs - transitionMs))}:d=${seconds(transitionMs)},`
      : ""
    // 每镜先按时间线入出点裁剪，再统一画幅、帧率和像素格式，避免拼接时参数不一致。
    filters.push(
      `[${clip.inputIndex}:v]trim=start=${seconds(clip.inMs)}:end=${seconds(clip.outMs)},`
      + `setpts=PTS-STARTPTS,fps=${fps},`
      + `scale=${width}:${height}:force_original_aspect_ratio=decrease,`
      + `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[${label}]`,
    )
    if (fadeFilter) {
      filters[filters.length - 1] = filters[filters.length - 1].replace(
        "format=yuv420p",
        `${fadeFilter}format=yuv420p`,
      )
    }
    videoLabels.push(`[${label}]`)
  })
  filters.push(
    `${videoLabels.join("")}concat=n=${videoLabels.length}:v=1:a=0[vout]`,
  )

  const dialogueLabels: string[] = []
  // 始终铺一条等长静音底轨，保证无对白、无 BGM 的集也能输出合法 AAC 音轨。
  filters.push(
    `anullsrc=r=48000:cl=stereo,atrim=0:${total},asetpts=PTS-STARTPTS[abed]`,
  )
  dialogueLabels.push("[abed]")

  input.dialogue.forEach((line, index) => {
    const label = `d${index}`
    filters.push(
      `[${line.inputIndex}:a]aresample=48000,`
      + "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,"
      + "asetpts=PTS-STARTPTS,"
      + `volume=${Math.max(0, line.volume).toFixed(3)},`
      + `adelay=${Math.max(0, Math.round(line.startMs))}|${Math.max(0, Math.round(line.startMs))}[${label}]`,
    )
    dialogueLabels.push(`[${label}]`)
  })

  if (input.bgm) {
    const fadeIn = Math.min(Math.max(0, input.bgm.fadeInMs), input.totalDurationMs)
    const fadeOut = Math.min(Math.max(0, input.bgm.fadeOutMs), input.totalDurationMs)
    const fadeOutStart = Math.max(0, input.totalDurationMs - fadeOut)
    filters.push(
      `[${input.bgm.inputIndex}:a]aresample=48000,`
      // 对白与 BGM 的源文件可能是单声道；侧链压缩要求两路通道布局一致。
      + "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,"
      + "asetpts=PTS-STARTPTS,"
      + `volume=${Math.max(0, input.bgm.volume).toFixed(3)},`
      + (fadeIn > 0 ? `afade=t=in:st=0:d=${seconds(fadeIn)},` : "")
      + (fadeOut > 0 ? `afade=t=out:st=${seconds(fadeOutStart)}:d=${seconds(fadeOut)},` : "")
      + `apad,atrim=0:${total}[bgm]`,
    )
  }

  if (input.bgm?.ducking) {
    filters.push(
      `${dialogueLabels.join("")}amix=inputs=${dialogueLabels.length}:duration=longest:dropout_transition=0[dialoguemix]`,
    )
    filters.push("[dialoguemix]asplit=2[dialoguetrack][dialogesc]")
    filters.push(
      "[bgm][dialogesc]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=320[bgmducked]",
    )
    filters.push(
      "[dialoguetrack][bgmducked]amix=inputs=2:duration=longest:dropout_transition=0,"
      + "loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.95[aout]",
    )
  } else {
    const mixLabels = input.bgm ? [...dialogueLabels, "[bgm]"] : dialogueLabels
    filters.push(
      `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0,`
      + "loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.95[aout]",
    )
  }

  return [
    "-hide_banner",
    "-y",
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-r",
    String(fps),
    "-t",
    total,
    "-movflags",
    "+faststart",
    input.outputPath,
  ]
}

export async function runMediaCommand(
  executable: string,
  args: string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ executable, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      // 只保留最后一段，既有助于诊断，也避免长转码把整段日志堆进内存。
      stderr = `${stderr}${String(chunk)}`.slice(-4_000)
    })
    child.on("error", (error) => {
      reject(new Error(`无法启动媒体工具：${error.message}`))
    })
    child.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`媒体处理失败（退出码 ${code}）：${stderr.trim().slice(-2_500)}`))
    })
  })
}

export interface MediaProbe {
  durationMs: number | null
  width: number | null
  height: number | null
}

export async function probeMedia(path: string): Promise<MediaProbe> {
  return new Promise<MediaProbe>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ resolveFfprobePath(), [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=width,height",
      "-of",
      "json",
      path,
    ], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += String(chunk) })
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-2_000) })
    child.on("error", (error) => {
      reject(new Error(`无法启动 ffprobe：${error.message}`))
    })
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`媒体文件无法读取：${stderr.trim().slice(-500)}`))
        return
      }
      try {
        const parsed = JSON.parse(stdout) as {
          format?: { duration?: string }
          streams?: Array<{ width?: number; height?: number }>
        }
        const durationSeconds = Number(parsed.format?.duration)
        const stream = parsed.streams?.find((item) => item.width && item.height)
        resolve({
          durationMs: Number.isFinite(durationSeconds) && durationSeconds > 0
            ? Math.round(durationSeconds * 1000)
            : null,
          width: stream?.width ? Math.floor(stream.width) : null,
          height: stream?.height ? Math.floor(stream.height) : null,
        })
      } catch {
        reject(new Error("ffprobe 返回了无法识别的媒体信息"))
      }
    })
  })
}
