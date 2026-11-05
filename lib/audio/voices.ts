import type { SystemVoice } from "./types.ts"

/**
 * 首版只提供平台预置音色，不接受用户声音样本。
 * voiceId 是内部稳定标识；未来接入具体 TTS 供应商时由适配层映射，不污染项目数据。
 */
export const SYSTEM_VOICES: readonly SystemVoice[] = [
  {
    id: "warm-female",
    providerId: "system",
    label: "温润女声",
    description: "中低音区，适合克制、情感浓度较高的对白。",
  },
  {
    id: "clear-female",
    providerId: "system",
    label: "清亮女声",
    description: "明亮清晰，适合节奏快、情绪外放的年轻角色。",
  },
  {
    id: "steady-male",
    providerId: "system",
    label: "沉稳男声",
    description: "低音更厚，适合成熟、掌权或压迫感较强的角色。",
  },
  {
    id: "young-male",
    providerId: "system",
    label: "清朗男声",
    description: "轻快直接，适合青年主角与日常对白。",
  },
  {
    id: "storyteller-female",
    providerId: "system",
    label: "女声旁白",
    description: "中性叙述感，适合内心独白和漫剧旁白。",
  },
  {
    id: "storyteller-male",
    providerId: "system",
    label: "男声旁白",
    description: "节奏稳定，适合信息量较大的叙述段落。",
  },
] as const

export function findSystemVoice(id: string): SystemVoice | null {
  return SYSTEM_VOICES.find((voice) => voice.id === id) ?? null
}
