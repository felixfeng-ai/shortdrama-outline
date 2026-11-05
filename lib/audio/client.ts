import { postJson, putJson } from "../api.ts"
import type { GeneratedAsset, GenerationBatch, GenerationTask } from "../generation/types.ts"
import type {
  ProjectVoiceCharacter,
  SystemVoice,
  VoiceProfile,
} from "./types.ts"
import type { SpeechAvailability } from "./tts-model.ts"

export interface VoiceProfileState {
  voices: SystemVoice[]
  characters: ProjectVoiceCharacter[]
  profiles: VoiceProfile[]
  tts: SpeechAvailability
}

export interface AudioGenerationState {
  tasks: GenerationTask[]
  assets: GeneratedAsset[]
  batches: GenerationBatch[]
}

export interface TtsBatchResult {
  batch: GenerationBatch | null
  tasks: GenerationTask[]
  assets: GeneratedAsset[]
  blocked: Array<{ targetId: string; reason: string }>
  failures: Array<{ targetId: string; reason: string }>
}

export async function fetchVoiceProfiles(projectId: string): Promise<VoiceProfileState> {
  const params = new URLSearchParams({ projectId })
  const response = await fetch(`/api/audio/voice-profiles?${params.toString()}`)
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "音色配置读取失败")
  }
  return payload.data as VoiceProfileState
}

export function saveVoiceProfile(input: {
  projectId: string
  characterId: string
  voiceId: string
  speed?: number
  volume?: number
}): Promise<{ profile: VoiceProfile }> {
  // 只提交音色标识与播放参数；不读取、不编码也不上传任何用户声音样本。
  return putJson(
    `/api/audio/voice-profiles/${encodeURIComponent(input.characterId)}`,
    {
      projectId: input.projectId,
      voiceId: input.voiceId,
      speed: input.speed,
      volume: input.volume,
    },
  )
}

export async function deleteVoiceProfile(
  projectId: string,
  characterId: string,
): Promise<boolean> {
  const params = new URLSearchParams({ projectId })
  const response = await fetch(
    `/api/audio/voice-profiles/${encodeURIComponent(characterId)}?${params.toString()}`,
    { method: "DELETE" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "音色绑定取消失败")
  }
  return payload.data.deleted === true
}

export function generateShotTts(input: {
  projectId: string
  shotId: string
  maxBudgetMicros: number
  idempotencyKey?: string
}): Promise<{
  task: import("../generation/types.ts").GenerationTask
  asset: import("../generation/types.ts").GeneratedAsset | null
  reused: boolean
}> {
  return postJson("/api/audio/tts", input)
}

export async function fetchAudioState(projectId: string): Promise<AudioGenerationState> {
  const params = new URLSearchParams({ projectId })
  const response = await fetch(`/api/audio/tts?${params.toString()}`)
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "语音任务读取失败")
  }
  return payload.data as AudioGenerationState
}

export function generateShotTtsBatch(input: {
  projectId: string
  episode: number
  maxBudgetMicros: number
  idempotencyKey: string
}): Promise<TtsBatchResult> {
  // 批量接口不接收客户端台词或音色，所有付费输入都由服务端根据项目快照解析。
  return postJson("/api/audio/tts/batch", input)
}
