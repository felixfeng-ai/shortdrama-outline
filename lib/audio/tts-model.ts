import { InputError } from "../api.ts"
import { countSpeechCharacters } from "./text.ts"

export { countSpeechCharacters } from "./text.ts"

export interface MiniMaxSpeechConfig {
  apiKey: string
  model: string
  baseUrl: string
  pricePer1kCharsMicros: number
}

export interface SpeechAvailability {
  enabled: boolean
  model: string
  pricePer1kCharsMicros: number | null
  reason: string | null
}

// 内部音色 id 不直接暴露供应商命名；换 TTS 供应商时只改这一层映射。
const PROVIDER_VOICE_IDS: Record<string, string> = {
  "warm-female": "female-chengshu",
  "clear-female": "female-tianmei",
  "steady-male": "presenter_male",
  "young-male": "male-qn-qingse",
  "storyteller-female": "audiobook_female_1",
  "storyteller-male": "audiobook_male_1",
}

export function getMiniMaxSpeechConfig(
  env: Record<string, string | undefined> = process.env,
): MiniMaxSpeechConfig {
  if (!/^(1|true|yes|on)$/i.test(env.TTS_ENABLED?.trim() ?? "")) {
    throw new InputError("语音生成尚未启用")
  }
  const apiKey = env.MINIMAX_TTS_API_KEY?.trim() || env.MINIMAX_API_KEY?.trim() || ""
  if (!apiKey) throw new InputError("平台语音服务未配置，请联系管理员")
  const price = Number(env.MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS)
  if (!Number.isSafeInteger(price) || price <= 0) {
    throw new InputError("平台语音服务未配置每千字符价格")
  }
  return {
    apiKey,
    model: env.MINIMAX_TTS_MODEL?.trim() || "speech-02-hd",
    baseUrl: (env.MINIMAX_TTS_BASE_URL?.trim() || "https://api.minimaxi.com").replace(/\/+$/, ""),
    pricePer1kCharsMicros: price,
  }
}

export function getMiniMaxSpeechAvailability(
  env: Record<string, string | undefined> = process.env,
): SpeechAvailability {
  const enabled = /^(1|true|yes|on)$/i.test(env.TTS_ENABLED?.trim() ?? "")
  const apiKey = env.MINIMAX_TTS_API_KEY?.trim() || env.MINIMAX_API_KEY?.trim() || ""
  const price = Number(env.MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS)
  const configuredPrice = Number.isSafeInteger(price) && price > 0 ? price : null
  const reason = !enabled
    ? "语音生成尚未启用"
    : !apiKey
      ? "平台语音服务未配置"
      : configuredPrice === null
        ? "平台语音服务未配置价格"
        : null
  return {
    enabled: reason === null,
    model: env.MINIMAX_TTS_MODEL?.trim() || "speech-02-hd",
    pricePer1kCharsMicros: configuredPrice,
    reason,
  }
}

export function estimateSpeechCostMicros(input: {
  characters: number
  pricePer1kCharsMicros: number
}): number {
  const characters = Math.max(0, Math.floor(input.characters))
  const price = Math.max(0, Math.floor(input.pricePer1kCharsMicros))
  return Math.ceil(characters / 1000 * price)
}

export function buildMiniMaxSpeechRequest(input: {
  text: string
  voiceId: string
  speed: number
  volume: number
  model: string
  baseUrl?: string
}): { url: string; body: Record<string, unknown> } {
  const text = input.text.trim()
  if (!text) throw new InputError("台词不能为空")
  const providerVoiceId = PROVIDER_VOICE_IDS[input.voiceId]
  if (!providerVoiceId) throw new InputError("系统音色映射不存在")
  return {
    url: `${(input.baseUrl || "https://api.minimaxi.com").replace(/\/+$/, "")}/v1/t2a_v2`,
    body: {
      model: input.model,
      text,
      stream: false,
      output_format: "hex",
      voice_setting: {
        voice_id: providerVoiceId,
        speed: Math.max(0.5, Math.min(2, input.speed)),
        vol: Math.max(0.01, Math.min(10, input.volume)),
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
      language_boost: "Chinese",
    },
  }
}

export function parseMiniMaxSpeechResponse(payload: unknown): {
  bytes: Uint8Array
  mime: "audio/mpeg"
  durationMs: number | null
  usageCharacters: number | null
  usage: Record<string, unknown>
} {
  const root = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {}
  const base = root.base_resp && typeof root.base_resp === "object"
    ? root.base_resp as Record<string, unknown>
    : {}
  if (Number(base.status_code) !== 0) {
    throw new Error(
      typeof base.status_msg === "string" && base.status_msg.trim()
        ? base.status_msg.trim()
        : "语音服务返回错误",
    )
  }
  const data = root.data && typeof root.data === "object"
    ? root.data as Record<string, unknown>
    : {}
  const audio = typeof data.audio === "string" ? data.audio.trim() : ""
  if (!audio || audio.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(audio)) {
    throw new Error("语音服务没有返回有效音频")
  }
  const extra = root.extra_info && typeof root.extra_info === "object"
    ? root.extra_info as Record<string, unknown>
    : {}
  const bytes = new Uint8Array(Buffer.from(audio, "hex"))
  if (bytes.length === 0) throw new Error("语音服务返回空音频")
  return {
    bytes,
    mime: "audio/mpeg",
    durationMs: Number.isFinite(Number(extra.audio_length))
      ? Math.max(0, Math.round(Number(extra.audio_length)))
      : null,
    usageCharacters: Number.isFinite(Number(extra.usage_characters))
      ? Math.max(0, Math.round(Number(extra.usage_characters)))
      : null,
    usage: extra,
  }
}
