// 节奏曲线：每集一个 1-5 的强度分，先把"节奏"变成看得见的东西。
// 这是人工判断，不是模型打分——模型给的初值只能当线索。

export const MIN_INTENSITY = 1
export const MAX_INTENSITY = 5
export const DEFAULT_INTENSITY = 3

export function clampIntensity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_INTENSITY
  return Math.min(MAX_INTENSITY, Math.max(MIN_INTENSITY, Math.round(n)))
}

export function pacingSeries(episodes: { intensity?: number }[]): number[] {
  return episodes.map((e) => clampIntensity(e.intensity))
}

/**
 * 一条几乎平的线说明节奏没起伏。
 * 用「最高-最低 ≤ 1」而不是「不同档位 ≤2」——否则 3 和 5 两档也会被误判成平线。
 */
export function isFlatPacing(series: number[]): boolean {
  if (series.length < 3) return false
  return Math.max(...series) - Math.min(...series) <= 1
}

/** 极值所在的集号（1-based）；全平时返回 null */
export function pacingExtremes(series: number[]): { low: number; high: number } | null {
  if (series.length === 0) return null
  let low = 0
  let high = 0
  series.forEach((v, i) => {
    if (v < series[low]) low = i
    if (v > series[high]) high = i
  })
  if (series[low] === series[high]) return null
  return { low: low + 1, high: high + 1 }
}

export function pacingHint(series: number[]): string {
  if (series.length === 0) return ''
  if (isFlatPacing(series)) return '强度几乎是一条平线，中段容易掉';
  const ex = pacingExtremes(series)
  if (!ex) return ''
  return `最低在第 ${ex.low} 集，最高在第 ${ex.high} 集`
}
