import type {
  NovelBudgetEstimate,
  NovelPreset,
  NovelPresetId,
} from "./types.ts"

/**
 * 三档篇幅都是明确选择，不提供“默认推荐已选中”状态。
 * 标准版使用 90 章，是为了给 20-25 万字一个稳定、可预算的中间值；
 * 它不代表任何项目会自动生成 90 章。
 */
export const NOVEL_PRESETS: NovelPreset[] = [
  {
    id: "medium",
    label: "中篇版",
    description: "适合先验证阅读反馈，再决定是否扩写成长篇。",
    wordsMin: 60_000,
    wordsMax: 80_000,
    chaptersMin: 30,
    chaptersMax: 40,
    targetChapters: 35,
    chapterWordsMin: 1_800,
    chapterWordsMax: 2_200,
  },
  {
    id: "standard",
    label: "标准长篇版",
    description: "推荐首发使用，可支撑持续连载和平台签约评估。",
    wordsMin: 200_000,
    wordsMax: 250_000,
    chaptersMin: 80,
    chaptersMax: 100,
    targetChapters: 90,
    chapterWordsMin: 2_200,
    chapterWordsMax: 2_600,
  },
  {
    id: "serial",
    label: "长连载版",
    description: "适合已有稳定更新计划的长篇项目。",
    wordsMin: 300_000,
    wordsMax: 380_000,
    chaptersMin: 120,
    chaptersMax: 150,
    targetChapters: 135,
    chapterWordsMin: 2_200,
    chapterWordsMax: 2_800,
  },
]

export function readNovelPreset(value: unknown): NovelPreset | null {
  if (typeof value !== "string") return null
  return NOVEL_PRESETS.find((preset) => preset.id === value) ?? null
}

export function requireNovelPreset(value: unknown): NovelPreset {
  const preset = readNovelPreset(value)
  if (!preset) {
    const error = new Error("请选择小说篇幅后再继续") as Error & { status?: number }
    error.status = 400
    throw error
  }
  return preset
}

export function novelPresetLabel(id: NovelPresetId): string {
  return NOVEL_PRESETS.find((preset) => preset.id === id)?.label ?? "未选择"
}

/**
 * 中文创作 token 通常高于字符数的一半，但会受对白、标点和 JSON 包装影响。
 * 预估区间刻意偏保守，宁可在确认页显得贵一点，也不要在结算时突然超支。
 */
export function estimateNovelGeneration(
  preset: NovelPreset,
  episodeCount: number,
): NovelBudgetEstimate {
  const chapters = preset.targetChapters
  const outputTokensMin = Math.ceil(preset.wordsMin * 1.2)
  const outputTokensMax = Math.ceil(preset.wordsMax * 1.8)
  // 每 5 章视为一个计费批次；章数增加时成本只线性增长，不阻塞主剧渲染。
  const quotaUnits = Math.ceil(chapters / 5) * 3
  const lowHours = Math.max(1, Math.ceil(chapters / 24))
  const highHours = Math.max(2, Math.ceil(chapters / 15))
  return {
    presetId: preset.id,
    chapters,
    wordsMin: preset.wordsMin,
    wordsMax: preset.wordsMax,
    outputTokensMin,
    outputTokensMax,
    quotaUnits,
    durationLabel: `${lowHours}-${highHours} 小时`,
    notice: `将复用当前 ${Math.max(0, episodeCount)} 集剧情。小说任务优先级低于图片、视频与成片渲染，媒体任务运行时会自动等待。`,
  }
}
