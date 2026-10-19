// 分集集数的唯一事实源：UI、prompt、批次规划、额度都从这里取。
// 之前 10 这个数字散在 prompt / normalize / validate 三处，改一处就会漏。

export const MIN_EPISODE_COUNT = 6
export const MAX_EPISODE_COUNT = 120
export const DEFAULT_EPISODE_COUNT = 30
/** 单次模型调用最多写几集：deepseek-chat 的输出上限装不下更多 */
export const EPISODE_BATCH_SIZE = 10
export const EPISODE_PRESETS = [10, 30, 60] as const

export function clampEpisodeCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EPISODE_COUNT
  return Math.min(MAX_EPISODE_COUNT, Math.max(MIN_EPISODE_COUNT, Math.round(value)))
}

/** 入参可能是 undefined / number / 字符串；非法值退回 fallback，不报错 */
export function readEpisodeCount(value: unknown, fallback = DEFAULT_EPISODE_COUNT): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  return Number.isFinite(n) ? clampEpisodeCount(n) : fallback
}

/** 从第几集开始（1-based）；用于"先定第一集，再生成其余" */
export function readEpisodeStart(value: unknown, fallback = 1): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_EPISODE_COUNT, Math.max(1, Math.round(n)))
}

export interface EpisodeBatch {
  start: number
  end: number
}

/** 60 集 → 1-10、11-20…51-60 */
export function planEpisodeBatches(total: number, batchSize = EPISODE_BATCH_SIZE): EpisodeBatch[] {
  const count = clampEpisodeCount(total)
  const size = Math.max(1, Math.floor(batchSize))
  const batches: EpisodeBatch[] = []
  for (let start = 1; start <= count; start += size) {
    batches.push({ start, end: Math.min(count, start + size - 1) })
  }
  return batches
}

/** 单批 token 预算：10 集约 6200，20 集封顶 8000 */
export function episodeTokenBudget(count: number): number {
  return Math.min(8000, 3000 + Math.round(count) * 320)
}

/** 每 10 集按一次「分集」计价（3 单位） */
export function episodeQuotaUnits(count: number): number {
  return planEpisodeBatches(count).length * 3
}

/** 粗估生成耗时：10 集约 1-2 分钟，30 集约 2-3 分钟，60 集约 4-6 分钟 */
export function episodeTimeEstimate(count: number): string {
  const low = Math.max(1, Math.round(count / 15))
  const high = Math.max(2, Math.round(count / 10))
  return `${low}-${high} 分钟`
}

/**
 * 一部完整项目的额度：其余五步固定 10 单位（人物 1 + 三幕 1 + 定妆 2 + 场景 2 + 分镜 4），
 * 分集按批次累加。10 集 = 13（与历史口径一致），30 集 = 19，60 集 = 28。
 */
export const FIXED_STEPS_UNITS = 10

export function projectQuotaUnits(count: number): number {
  return FIXED_STEPS_UNITS + episodeQuotaUnits(count)
}
