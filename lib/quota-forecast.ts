export interface QuotaForecast {
  units: number
  remaining: number | null
  known: boolean
  affordable: boolean
  shortBy: number
  label: string
}

/**
 * 前端只做可解释的预估；服务端 chargeQuota 仍是最终权威。
 * null 表示额度接口还没返回或读取失败，此时不能把未知误判成不足。
 */
export function forecastQuota(
  units: number,
  remaining: number | null | undefined,
): QuotaForecast {
  const safeUnits = Math.max(1, Math.ceil(Number(units) || 1))
  const known = remaining !== null
    && remaining !== undefined
    && Number.isFinite(Number(remaining))
  const current = known ? Math.max(0, Math.floor(Number(remaining))) : null
  if (!known || current === null) {
    return {
      units: safeUnits,
      remaining: null,
      known: false,
      affordable: true,
      shortBy: 0,
      label: `本步 ${safeUnits} 单位 · 额度读取中`,
    }
  }

  const shortBy = Math.max(0, safeUnits - current)
  return {
    units: safeUnits,
    remaining: current,
    known: true,
    affordable: shortBy === 0,
    shortBy,
    label: shortBy === 0
      ? `本步 ${safeUnits} 单位 · 剩余 ${current}`
      : `本步 ${safeUnits} 单位 · 剩余 ${current} · 额度不足（差 ${shortBy}）`,
  }
}
