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
  value: number | null
  onChange: (value: number) => void
  /** 当前项目已有的集数；与 value 不同时提示会被替换 */
  existing?: number
  disabled?: boolean
  /** 1-3 集样片不走整季最少 6 集的限制。 */
  sampleMode?: boolean
}

export default function EpisodeCountPicker({
  value,
  onChange,
  existing = 0,
  disabled = false,
  sampleMode = false,
}: Props) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  useEffect(() => setDraft(value === null ? '' : String(value)), [value])
  const min = sampleMode ? 1 : MIN_EPISODE_COUNT
  const max = sampleMode ? 3 : MAX_EPISODE_COUNT
  const presets = sampleMode ? [1, 3] : EPISODE_PRESETS

  const commit = () => {
    if (!draft.trim()) return
    const numeric = Number(draft)
    const next = sampleMode
      ? Number.isFinite(numeric)
        ? Math.min(max, Math.max(min, Math.round(numeric)))
        : min
      : clampEpisodeCount(numeric)
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <div className="ep-picker">
      <span className="ep-label">本剧集数</span>
      {presets.map((n) => (
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
          min={min}
          max={max}
          value={draft}
          placeholder="请选择"
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
        {value === null
          ? `请选择本剧集数；选择前不会默认生成。${existing > 0 ? `当前项目已有 ${existing} 集。` : ''}`
          : sampleMode
            ? `样片 ${value} 集 · 约 ${projectQuotaUnits(value)} 单位 · 进入正式生产后再扩成小批或整季`
            : `本剧约 ${projectQuotaUnits(value)} 单位 · 每 10 集分批生成 · 当前 ${value} 集${
              existing > 0 && existing !== value ? ` · 重新生成会替换现有 ${existing} 集` : ''
            }`}
      </span>
    </div>
  )
}
