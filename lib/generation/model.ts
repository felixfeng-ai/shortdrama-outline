import { InputError } from "../api.ts"

export type ImageAspect = "portrait" | "vertical" | "landscape" | "square"

export const ALIYUN_IMAGE_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"
export const ALIYUN_IMAGE_DEFAULT_MODEL = "wanx2.1-t2i-turbo"

export interface AliyunImageConfig {
  apiKey: string
  model: string
}

export interface AliyunImageRequest {
  url: string
  body: Record<string, unknown>
}

export function resolveImageAspect(value: unknown): ImageAspect {
  if (value === "portrait" || value === "vertical" || value === "landscape") return value
  return "square"
}

export function getAliyunImageConfig(
  env: Record<string, string | undefined> = process.env,
): AliyunImageConfig {
  const apiKey = env.ALIYUN_DASHSCOPE_API_KEY?.trim() || ""
  if (!apiKey) throw new InputError("平台图像服务未配置，请联系管理员")
  return {
    apiKey,
    model: env.ALIYUN_IMAGE_MODEL?.trim() || ALIYUN_IMAGE_DEFAULT_MODEL,
  }
}

export function buildAliyunImageRequest(input: {
  prompt: string
  model: string
  aspect?: unknown
  seed?: number
}): AliyunImageRequest {
  const prompt = input.prompt.trim()
  if (!prompt) throw new InputError("缺少图像提示词")
  if (prompt.length > 2100) throw new InputError("图像提示词过长，请控制在 2100 字以内")
  const model = input.model.trim()
  if (!model) throw new InputError("平台图像模型未配置")

  const sizes: Record<ImageAspect, string> = {
    portrait: "720*1280",
    vertical: "720*1280",
    landscape: "1280*720",
    square: "1024*1024",
  }
  return {
    url: `${ALIYUN_IMAGE_BASE_URL}/services/aigc/text2image/image-synthesis`,
    body: {
      model,
      input: { prompt },
      parameters: {
        size: sizes[resolveImageAspect(input.aspect)],
        n: 1,
        ...(Number.isInteger(input.seed) && input.seed! >= 0 && input.seed! <= 2147483647
          ? { seed: input.seed }
          : {}),
      },
    },
  }
}

export function projectImageSeed(projectId: string): number {
  let hash = 2166136261
  for (let index = 0; index < projectId.length; index += 1) {
    hash ^= projectId.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0 & 0x7fffffff
}

export function parseAliyunTaskSubmission(payload: unknown): string {
  const output = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).output
    : null
  const taskId = output && typeof output === "object"
    ? (output as Record<string, unknown>).task_id
    : null
  if (typeof taskId !== "string" || !taskId.trim()) {
    throw new Error("通义万相没有返回任务 id")
  }
  return taskId.trim()
}

export type AliyunTaskResult =
  | { status: "PENDING" | "RUNNING" | "UNKNOWN" }
  | { status: "SUCCEEDED"; imageUrl: string }
  | { status: "FAILED" | "CANCELED"; error: string }

export function parseAliyunTaskResult(payload: unknown): AliyunTaskResult {
  const output = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).output
    : null
  const record = output && typeof output === "object"
    ? output as Record<string, unknown>
    : {}
  const status = typeof record.task_status === "string" ? record.task_status : "UNKNOWN"

  if (status === "SUCCEEDED") {
    const results = Array.isArray(record.results) ? record.results : []
    const first = results[0] && typeof results[0] === "object"
      ? results[0] as Record<string, unknown>
      : {}
    const imageUrl = typeof first.url === "string" ? first.url.trim() : ""
    if (!imageUrl) throw new Error("通义万相没有返回图片地址")
    return { status, imageUrl }
  }
  if (status === "FAILED" || status === "CANCELED") {
    return {
      status,
      error: typeof record.message === "string" ? record.message : "通义万相生成失败",
    }
  }
  if (status === "PENDING" || status === "RUNNING") return { status }
  return { status: "UNKNOWN" }
}

export function publicGenerationError(value: string): string {
  return /api[- ]?key|access.?key|unauthorized|invalid.?token/i.test(value)
    ? "平台图像服务密钥无效，请联系管理员"
    : value
}

export function sniffImageMime(bytes: Uint8Array): string {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  throw new Error("Provider 返回的内容不是有效图片")
}
