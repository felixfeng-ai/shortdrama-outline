'use client'

// 额度显示条（C 模式托管版的前端落点）。
//
// 为什么要显示：托管版的模型费用是我们出的，用户必须知道「今天还能用多少」，
// 否则被拒时毫无预期，体验比「一开始就说明白」差得多。
//
// 三档视觉：
//   充足（>50%）  灰底，安静存在
//   偏低（<=50%） 琥珀色，提醒
//   用尽（0）     红色 + 明确告知「明天恢复 / 可自建」
import { useEffect, useState } from 'react'
import { fetchQuota, type QuotaDto } from '@/lib/assets/api'

interface Props {
  /** 生成成功后 +1，用来触发重新查询（额度已经变了） */
  refreshKey?: number
}

export default function QuotaBar({ refreshKey = 0 }: Props) {
  const [quota, setQuota] = useState<QuotaDto | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchQuota()
      .then((q) => { if (!cancelled) { setQuota(q); setFailed(false) } })
      // 额度是增强信息，查不到不该影响主流程（和台账读取同样的降级口径）
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [refreshKey])

  if (failed) return null
  if (!quota) {
    return (
      <div className="mt-3 h-9 animate-pulse rounded-chip bg-surface-deep" aria-hidden="true" />
    )
  }

  const ratio = quota.limit > 0 ? quota.remaining / quota.limit : 0
  const exhausted = quota.remaining <= 0
  const low = !exhausted && ratio <= 0.5

  // 三档都用「纸」表达，只靠朱砂的深浅区分严重程度，不再引第二个色相
  const tone = exhausted
    ? { box: 'border-accent-300 bg-accent-100', text: 'text-accent-800', bar: 'bg-accent-500' }
    : low
      ? { box: 'border-accent-200 bg-accent-50', text: 'text-accent-700', bar: 'bg-accent-400' }
      : { box: 'border-surface-line bg-surface-soft', text: 'text-ink-600', bar: 'bg-ink-300' }

  return (
    <div className={`mt-3 rounded-chip border px-3 py-2 ${tone.box}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium ${tone.text}`}>
          {exhausted ? '今日额度已用完' : '今日剩余额度'}
        </span>
        <span className={`text-xs tabular-nums ${tone.text}`}>
          {exhausted
            ? '明天恢复'
            : `可跑 ${quota.projectsLeft} 个完整项目（${quota.remaining}/${quota.limit}）`}
        </span>
      </div>

      {/* 进度条：剩余越多条越长 */}
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-card/70">
        <div
          className={`h-full rounded-full transition-all ${tone.bar}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      {exhausted && (
        <p className={`mt-1.5 text-[11px] leading-relaxed ${tone.text}`}>
          额度每天恢复。也可以把代码拿去自建，用你自己的 API Key，不受限制。
        </p>
      )}
    </div>
  )
}
