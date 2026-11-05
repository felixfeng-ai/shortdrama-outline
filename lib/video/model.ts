import { InputError } from "../api.ts"

export const MINIMAX_VIDEO_BASE_URL = "https://api.minimax.cn"
export const MINIMAX_VIDEO_DEFAULT_MODEL = "MiniMax-H3-Lite"
export const MINIMAX_VIDEO_DEFAULT_RESOLUTION = "768P"

export type MiniMaxVideoModel =
  | "MiniMax-H3"
  | "MiniMax-H3-Highspeed"
  | "MiniMax-H3-Lite"
  | "MiniMax-H3-Max"

export type MiniMaxVideoResolution = "480P" | "768P" | "2K"

interface VideoModelConfig {
  minDuration: number
  maxDuration: number
  pricesPerSecond: Partial<Record<MiniMaxVideoResolution, number>>
}

const MODEL_CONFIGS: Record<MiniMaxVideoModel, VideoModelConfig> = {
  "MiniMax-H3": {
    minDuration: 4,
    maxDuration: 15,
    pricesPerSecond: { "768P": 0.5, "2K": 0.8 },
  },
  "MiniMax-H3-Highspeed": {
    minDuration: 4,
    maxDuration: 15,
    pricesPerSecond: { "480P": 0.26, "768P": 0.4 },
  },
  "MiniMax-H3-Lite": {
    minDuration: 4,
    maxDuration: 15,
    pricesPerSecond: { "480P": 0.16, "768P": 0.26 },
  },
  "MiniMax-H3-Max": {
    minDuration: 5,
    maxDuration: 15,
    pricesPerSecond: { "480P": 0.33, "768P": 0.5 },
  },
}

export interface MiniMaxVideoConfig {
  apiKey: string
  model: MiniMaxVideoModel
  defaultResolution: MiniMaxVideoResolution
}

export interface MiniMaxVideoRequest {
  url: string
  body: Record<string, unknown>
}

export interface VideoInputImage {
  bytes: Uint8Array
  mime: string
}

export type MiniMaxVideoTaskState =
  | { status: "queued" | "running" | "canceled" }
  | {
    status: "succeeded"
    videoUrl: string
    durationSeconds: number | null
    resolution: string | null
    ratio: string | null
    usage: Record<string, unknown>
  }
  | { status: "failed"; error: string; errorCode: string | null }

function truthyFlag(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "")
}

function modelFrom(value: string | undefined): MiniMaxVideoModel {
  const model = (value?.trim() || MINIMAX_VIDEO_DEFAULT_MODEL) as MiniMaxVideoModel
  if (!(model in MODEL_CONFIGS)) throw new InputError("视频模型不支持")
  return model
}

function resolutionFrom(value: string | undefined): MiniMaxVideoResolution {
  const resolution = (value?.trim() || MINIMAX_VIDEO_DEFAULT_RESOLUTION) as MiniMaxVideoResolution
  if (!["480P", "768P", "2K"].includes(resolution)) {
    throw new InputError("视频分辨率不支持")
  }
  return resolution
}

export function getMiniMaxVideoConfig(
  env: Record<string, string | undefined> = process.env,
): MiniMaxVideoConfig {
  if (!truthyFlag(env.VIDEO_GENERATION_ENABLED)) {
    throw new InputError("视频生成尚未启用")
  }
  const apiKey = env.MINIMAX_API_KEY?.trim() || ""
  if (!apiKey) throw new InputError("平台视频服务未配置，请联系管理员")
  return {
    apiKey,
    model: modelFrom(env.MINIMAX_VIDEO_MODEL),
    defaultResolution: resolutionFrom(env.MINIMAX_VIDEO_RESOLUTION),
  }
}

function modelConfig(model: string): VideoModelConfig {
  const config = MODEL_CONFIGS[model as MiniMaxVideoModel]
  if (!config) throw new InputError("视频模型不支持")
  return config
}

function validateDuration(model: string, duration: number): number {
  const value = Math.floor(duration)
  const config = modelConfig(model)
  if (!Number.isFinite(value) || value < config.minDuration || value > config.maxDuration) {
    throw new InputError(`视频时长必须在 ${config.minDuration}-${config.maxDuration} 秒`)
  }
  return value
}

export function estimateVideoCostMicros(input: {
  model: string
  resolution: string
  duration: number
}): number {
  const config = modelConfig(input.model)
  const duration = validateDuration(input.model, input.duration)
  const price = config.pricesPerSecond[input.resolution as MiniMaxVideoResolution]
  if (price === undefined) {
    throw new InputError(`${input.model} 不支持 ${input.resolution}`)
  }
  return Math.round(price * duration * 1_000_000)
}

function toDataUri(image: VideoInputImage): string {
  if (!["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"].includes(image.mime)) {
    throw new InputError("首帧格式不支持")
  }
  if (image.bytes.length === 0) throw new InputError("首帧内容为空")
  if (image.bytes.length > 30 * 1024 * 1024) throw new InputError("首帧不能超过 30MB")
  return `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`
}

export function buildMiniMaxVideoRequest(input: {
  prompt: string
  model: string
  resolution: string
  duration: number
  ratio: string
  firstFrame?: VideoInputImage
}): MiniMaxVideoRequest {
  const prompt = input.prompt.trim()
  if (!prompt) throw new InputError("缺少视频提示词")
  if (prompt.length > 7000) throw new InputError("视频提示词不能超过 7000 字符")
  const duration = validateDuration(input.model, input.duration)
  modelConfig(input.model)
  estimateVideoCostMicros({
    model: input.model,
    resolution: input.resolution,
    duration,
  })

  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }]
  if (input.firstFrame) {
    content.push({
      type: "image_url",
      image_url: { url: toDataUri(input.firstFrame) },
      role: "first_frame",
    })
  }
  const ratio = input.firstFrame
    ? "adaptive"
    : input.ratio === "16:9" || input.ratio === "9:16"
      ? input.ratio
      : "9:16"

  return {
    url: `${MINIMAX_VIDEO_BASE_URL}/v2/video_generation`,
    body: {
      model: input.model,
      content,
      resolution: input.resolution,
      duration,
      ratio,
      aigc_watermark: false,
    },
  }
}

export function parseMiniMaxVideoSubmission(payload: unknown): string {
  const taskId = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).task_id
    : null
  if (typeof taskId !== "string" || !taskId.trim()) {
    throw new Error("视频服务没有返回任务 id")
  }
  return taskId.trim()
}

export function parseMiniMaxVideoTask(payload: unknown): MiniMaxVideoTaskState {
  const task = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).task
    : null
  const record = task && typeof task === "object"
    ? task as Record<string, unknown>
    : {}
  const status = typeof record.status === "string" ? record.status : ""

  if (status === "queued" || status === "running") return { status }
  if (status === "cancelled" || status === "canceled") return { status: "canceled" }
  if (status === "succeeded") {
    const content = record.content && typeof record.content === "object"
      ? record.content as Record<string, unknown>
      : {}
    const videoUrl = typeof content.url === "string" ? content.url.trim() : ""
    if (!videoUrl) throw new Error("视频服务没有返回成片地址")
    return {
      status,
      videoUrl,
      durationSeconds: typeof record.duration === "number" ? record.duration : null,
      resolution: typeof record.resolution === "string" ? record.resolution : null,
      ratio: typeof record.ratio === "string" ? record.ratio : null,
      usage: record.usage && typeof record.usage === "object"
        ? record.usage as Record<string, unknown>
        : {},
    }
  }
  if (status === "failed") {
    const error = record.error && typeof record.error === "object"
      ? record.error as Record<string, unknown>
      : {}
    return {
      status,
      error: typeof error.message === "string" ? error.message : "视频生成失败",
      errorCode: typeof error.code === "string" ? error.code : null,
    }
  }
  throw new Error("视频任务状态无法识别")
}

export function publicVideoGenerationError(value: string): string {
  return /api[- ]?key|access.?key|unauthorized|invalid.?token/i.test(value)
    ? "平台视频服务密钥无效，请联系管理员"
    : value
}
