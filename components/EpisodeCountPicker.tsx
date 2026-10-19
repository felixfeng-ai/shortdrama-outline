'use client'

// 分集集数选择：预设 10 / 30 / 60，或自定义 6-120。
// 每 10 集一批，所以选项文案里直接写清"分批生成"，避免用户以为是一次性出的。
import { useEffect, useState } from 'react'
import {
  EPISODE_PRESETS,
  MAX_EPISODE_COUNT,
  MIN_EPISODE_COUNT,
  clampEpisodeCount,
  projectQuotaUnits,
} from '@/lib/episodes'

interface Props {
  value: number
  onChange: (value: number) => void
  /** 当前项目已有的集数；与 value 不同时提示会被替换 */
  existing?: number
  disabled?: boolean
}

export default function EpisodeCountPicker({ value, onChange, existing = 0, disabled = false }: Props) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = () => {
    const next = clampEpisodeCount(Number(draft))
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <div className="ep-picker">
      <span className="ep-label">本剧集数</span>
      {EPISODE_PRESETS.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={`ep-chip ${value === n ? 'on' : ''}`}
        >
          {n} 集
        </button>
      ))}
      <label className="ep-custom">
        自定义
        <input
          type="number"
          min={MIN_EPISODE_COUNT}
          max={MAX_EPISODE_COUNT}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          aria-label="自定义集数"
        />
      </label>
      <span className="ep-hint">
        本剧约 {projectQuotaUnits(value)} 单位 · 每 10 集分批生成 · 当前 {value} 集
        {existing > 0 && existing !== value ? ` · 重新生成会替换现有 ${existing} 集` : ''}
      </span>
    </div>
  )
}
