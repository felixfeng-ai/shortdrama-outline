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
import { DEFAULT_EPISODE_COUNT } from '@/lib/episodes'

interface Props {
  /** 生成成功后 +1，用来触发重新查询（额度已经变了） */
  refreshKey?: number
  /** 顶部品牌旁的紧凑版：一行数字 + 一条细进度，不再是自己一张卡 */
  compact?: boolean
  /** 顶栏里的一行等宽小字：额度属于"机器状态"，不该占掉半条顶栏 */
  inline?: boolean
  /** 当前选定的集数：顶栏按这个集数估算「还能跑几部」 */
  episodeCount?: number
}

export default function QuotaBar({
  refreshKey = 0,
  compact = false,
  inline = false,
  episodeCount = DEFAULT_EPISODE_COUNT,
}: Props) {
  const [quota, setQuota] = useState<QuotaDto | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchQuota(episodeCount)
        .then((q) => { if (!cancelled) { setQuota(q); setFailed(false) } })
        // 额度是增强信息，查不到不该影响主流程。
        .catch(() => { if (!cancelled) setFailed(true) })
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") load()
    }
    load()
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.removeEventListener('focus', load)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshKey, episodeCount])

  if (failed) return null
  if (!quota) {
    if (inline) return <span className="h-quota" aria-hidden="true">创作额度 —</span>
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

  const label = exhausted ? '今日创作额度已用完' : '今日剩余创作额度'
  const estimate = quota.estimates.selected
  const projectsText = estimate.projectsLeft >= 1
    ? `约 ${estimate.projectsLeft} 部 ${estimate.episodeCount} 集短剧`
    : '不够一部完整短剧'
  const value = exhausted
    ? '明天恢复'
    : projectsText
  const presetText = quota.projectEstimates
    .map((item) => `${item.episodeCount} 集约 ${item.projectsLeft} 部`)
    .join(' · ')
  const detail = `本日创作额度 ${quota.remaining}/${quota.limit} 单位。当前 ${estimate.episodeCount} 集项目约 ${estimate.units} 单位；${presetText}。图片生成 ${quota.mediaCosts.imageGenerate} 单位、编辑 ${quota.mediaCosts.imageEdit} 单位、成片 ${quota.mediaCosts.render} 单位；视频、TTS 与 Agent 重试共用本额度。`

  // 顶栏内联版：只留数字，明细进 title
  if (inline) {
    const inlineTitle = exhausted
      ? `${label}（本日 ${quota.remaining}/${quota.limit} 单位），明天按北京时间恢复。`
      : `${label}：${detail}`
    return (
      <span
        className="h-quota"
        style={exhausted || low ? { color: 'rgb(var(--c-accent-700))' } : undefined}
        title={inlineTitle}
      >
        {exhausted
          ? '创作额度用尽'
          : `创作额度 ${quota.remaining}/${quota.limit} · ${estimate.projectsLeft} 部 ${estimate.episodeCount} 集`}
      </span>
    )
  }

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
          今日创作额度将在北京时间零点恢复。
        </p>
      )}
    </div>
  )
}
