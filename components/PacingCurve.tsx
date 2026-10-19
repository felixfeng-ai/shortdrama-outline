'use client'

// 节奏曲线：把每集的强度连成一条线，让"中段会不会塌"变成看得见的事。
import { pacingHint, pacingSeries } from '@/lib/pacing'
import type { Episode } from '@/lib/types'

export default function PacingCurve({ episodes }: { episodes: Episode[] }) {
  if (episodes.length === 0) return null
  const series = pacingSeries(episodes)
  const rated = episodes.some((e) => typeof e.intensity === 'number')
  const w = 100
  const h = 28
  const step = series.length > 1 ? w / (series.length - 1) : w
  const y = (v: number) => h - ((v - 1) / 4) * (h - 4) - 2
  const points = series.map((v, i) => `${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ')

  return (
    <div className="pacing">
      <div className="pacing-head">
        <span className="pacing-title">节奏曲线</span>
        <span className="pacing-hint">
          {rated ? pacingHint(series) : '还没有打分 · 用每行的「强度」标一下'}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} className="pacing-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="pacing-scale"><span>1 平</span><span>5 强</span></div>
    </div>
  )
}
