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
  /** 顶部品牌旁的紧凑版：一行数字 + 一条细进度，不再是自己一张卡 */
  compact?: boolean
}

export default function QuotaBar({ refreshKey = 0, compact = false }: Props) {
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
    if (compact) {
      return <div className="hidden h-6 w-52 animate-pulse rounded-chip bg-surface-soft sm:block" aria-hidden="true" />
    }
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

  const label = exhausted ? '今日额度已用完' : '今日剩余额度'
  /*
    一行只留一个数字体系。
    原文案是「可跑 1 个完整项目（13/26）」——括号里是额度单位、前面是项目数，
    13 单位 = 1 个项目，两套数字并排用户算不清。单位明细收进 title，需要时悬浮可查。
  */
  /*
    「可跑 0 个完整项目」字面没错，但它读起来像「一点额度都没有了」——
    实际可能还剩几个单位，够做联想或几步生成。分开说，别把有余量说成没余量。
  */
  const value = exhausted
    ? '明天恢复'
    : quota.projectsLeft >= 1
      ? `可跑 ${quota.projectsLeft} 个完整项目`
      : '还能跑几步（不够一个完整项目）'
  const detail = `本日额度 ${quota.remaining}/${quota.limit} 单位（1 个完整项目 = 13 单位）`

  // 紧凑版：挂在顶部品牌旁边，只留一行数字 + 一条细进度
  if (compact) {
    return (
      <div className="hidden min-w-[13rem] shrink-0 sm:block" title={`${label}：${value}。${detail}`}>
        <div className={`flex items-baseline justify-between gap-3 text-[10.5px] ${tone.text}`}>
          <span>{label}</span>
          <span className="tabular-nums">{value}</span>
        </div>
        <div className="mt-1.5 h-[1.5px] w-full overflow-hidden rounded-full bg-surface-card/80">
          <div
            className={`h-full rounded-full transition-all ${tone.bar}`}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`mt-3 rounded-chip border px-3 py-2 ${tone.box}`} title={detail}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium ${tone.text}`}>{label}</span>
        <span className={`text-xs tabular-nums ${tone.text}`}>{value}</span>
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
