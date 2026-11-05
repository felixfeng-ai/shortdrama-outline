import {
  buildMiniMaxSpeechRequest,
  getMiniMaxSpeechConfig,
  parseMiniMaxSpeechResponse,
} from "./tts-model.ts"

type FetchLike = typeof fetch

export class SpeechProviderError extends Error {
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = "SpeechProviderError"
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function timeoutSignal(ms: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return external ? AbortSignal.any([external, timeout]) : timeout
}

function providerError(response: Response, payload: unknown): SpeechProviderError {
  // 将供应商 401/429/5xx 映射为平台可重试错误，避免把运维问题伪装成用户输入错误。
  const root = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {}
  const base = root.base_resp && typeof root.base_resp === "object"
    ? root.base_resp as Record<string, unknown>
    : {}
  const message = typeof base.status_msg === "string"
    ? base.status_msg
    : "平台语音服务请求失败"
  if (response.status === 401 || response.status === 403) {
    return new SpeechProviderError("平台语音服务密钥无效，请联系管理员", 503)
  }
  if (response.status === 402) {
    return new SpeechProviderError("平台语音服务余额不足，请联系管理员", 503)
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "")
    return new SpeechProviderError(
      "语音生成请求过于频繁，请稍后再试",
      503,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30,
    )
  }
  return new SpeechProviderError(message, 502)
}

export async function synthesizeMiniMaxSpeech(
  input: {
    text: string
    voiceId: string
    speed: number
    volume: number
    signal?: AbortSignal
  },
  fetchImpl: FetchLike = fetch,
  env: Record<string, string | undefined> = process.env,
) {
  const config = getMiniMaxSpeechConfig(env)
  const request = buildMiniMaxSpeechRequest({
    ...input,
    model: config.model,
    baseUrl: config.baseUrl,
  })
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
    throw new SpeechProviderError("平台语音服务连接失败，请稍后重试", 503)
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw providerError(response, payload)
  try {
    return {
      ...parseMiniMaxSpeechResponse(payload),
      model: config.model,
      pricingVersion: `minimax-tts-${config.pricePer1kCharsMicros}`,
      pricePer1kCharsMicros: config.pricePer1kCharsMicros,
    }
  } catch (error) {
    throw new SpeechProviderError(
      error instanceof Error ? error.message : "语音服务返回无法识别的内容",
      502,
    )
  }
}
