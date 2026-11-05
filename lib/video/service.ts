import { createHash } from "node:crypto"

import {
  MINIMAX_VIDEO_BASE_URL,
  buildMiniMaxVideoRequest,
  getMiniMaxVideoConfig,
  parseMiniMaxVideoSubmission,
  parseMiniMaxVideoTask,
  publicVideoGenerationError,
  type MiniMaxVideoTaskState,
  type VideoInputImage,
} from "./model.ts"

type FetchLike = typeof fetch

export class VideoProviderError extends Error {
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = "VideoProviderError"
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function timeoutSignal(ms: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return external ? AbortSignal.any([external, timeout]) : timeout
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return { error: { message: await response.text().catch(() => "") } }
  }
}

function providerError(payload: unknown, response: Response): VideoProviderError {
  const status = response.status
  const root = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {}
  const detail = root.error && typeof root.error === "object"
    ? root.error as Record<string, unknown>
    : {}
  const message = typeof detail.message === "string"
    ? detail.message
    : typeof root.message === "string"
      ? root.message
      : "平台视频服务请求失败"
  if (status === 401 || status === 403) {
    return new VideoProviderError("平台视频服务密钥无效，请联系管理员", 503)
  }
  if (status === 402) {
    return new VideoProviderError("平台视频服务余额不足，请联系管理员", 503)
  }
  if (status === 422) {
    return new VideoProviderError(
      "视频内容未通过供应商审核，请调整素材或提示词",
      422,
    )
  }
  if (status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "")
    return new VideoProviderError(
      "视频生成请求过于频繁，请稍后再试",
      503,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30,
    )
  }
  if (status >= 500) {
    return new VideoProviderError("平台视频服务请求失败，请稍后重试", 502)
  }
  return new VideoProviderError(publicVideoGenerationError(message), 502)
}

export async function submitMiniMaxVideo(input: {
  prompt: string
  model: string
  resolution: string
  duration: number
  ratio: string
  firstFrame?: VideoInputImage
  signal?: AbortSignal
}, fetchImpl: FetchLike = fetch, env: Record<string, string | undefined> = process.env) {
  const config = getMiniMaxVideoConfig(env)
  const request = buildMiniMaxVideoRequest(input)
  let response: Response
  try {
    response = await fetchImpl(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.body),
      signal: timeoutSignal(60_000, input.signal),
    })
  } catch (error) {
    if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw error
    }
    throw new VideoProviderError("平台视频服务连接失败，请稍后重试", 503)
  }
  const payload = await readJson(response)
  if (!response.ok) throw providerError(payload, response)
  return {
    providerTaskId: parseMiniMaxVideoSubmission(payload),
    config,
  }
}

export async function queryMiniMaxVideo(
  providerTaskId: string,
  fetchImpl: FetchLike = fetch,
  env: Record<string, string | undefined> = process.env,
  signal?: AbortSignal,
): Promise<MiniMaxVideoTaskState> {
  const config = getMiniMaxVideoConfig(env)
  let response: Response
  try {
    response = await fetchImpl(
      `${MINIMAX_VIDEO_BASE_URL}/v2/query/video_generation/${encodeURIComponent(providerTaskId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: timeoutSignal(30_000, signal),
      },
    )
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error
    throw new VideoProviderError("视频任务状态查询失败，稍后会自动重试", 503)
  }
  const payload = await readJson(response)
  if (!response.ok) throw providerError(payload, response)
  return parseMiniMaxVideoTask(payload)
}

export async function downloadMiniMaxVideo(
  videoUrl: string,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; mime: "video/mp4"; sha256: string }> {
  let response: Response
  try {
    response = await fetchImpl(videoUrl, {
      method: "GET",
      signal: timeoutSignal(180_000, signal),
    })
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error
    throw new Error("视频下载失败，可稍后仅重试下载")
  }
  if (!response.ok) throw new VideoProviderError("视频下载失败，可稍后仅重试下载", 502)
  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > 200 * 1024 * 1024) throw new Error("视频超过 200MB，已拒绝保存")
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length < 12 || bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) {
    throw new Error("供应商返回的内容不是有效 MP4")
  }
  if (bytes.length > 200 * 1024 * 1024) throw new Error("视频超过 200MB，已拒绝保存")
  return {
    bytes,
    mime: "video/mp4",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
}

export async function cancelMiniMaxVideo(
  providerTaskId: string,
  fetchImpl: FetchLike = fetch,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const config = getMiniMaxVideoConfig(env)
  const response = await fetchImpl(
    `${MINIMAX_VIDEO_BASE_URL}/v2/video_generation/${encodeURIComponent(providerTaskId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: timeoutSignal(30_000),
    },
  )
  const payload = await readJson(response)
  if (response.status === 400 || response.status === 404) return false
  if (!response.ok) throw providerError(payload, response)
  return true
}
