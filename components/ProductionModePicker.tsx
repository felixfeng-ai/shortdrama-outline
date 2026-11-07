"use client"

import { useEffect, useState } from "react"

import {
  PRODUCTION_MODE_PRESETS,
  normalizeProductionTarget,
} from "@/lib/production/presets"
import type { ProductionMode } from "@/lib/production/types"

interface Props {
  mode: ProductionMode | null
  targetEpisodes: number
  onModeChange: (mode: ProductionMode) => void
  onTargetEpisodesChange: (value: number) => void
  disabled?: boolean
}

export default function ProductionModePicker({
  mode,
  targetEpisodes,
  onModeChange,
  onTargetEpisodesChange,
  disabled = false,
}: Props) {
  const [draft, setDraft] = useState(String(targetEpisodes))

  useEffect(() => {
    setDraft(String(targetEpisodes))
  }, [targetEpisodes])

  function commitTarget() {
    if (!mode) return
    const next = normalizeProductionTarget(mode, draft)
    setDraft(String(next))
    if (next !== targetEpisodes) onTargetEpisodesChange(next)
  }

  return (
    <fieldset className="production-mode-picker">
      <legend>生产模式</legend>
      <div className="production-mode-options" role="group" aria-label="选择生产模式">
        {(Object.keys(PRODUCTION_MODE_PRESETS) as ProductionMode[]).map((key) => {
          const preset = PRODUCTION_MODE_PRESETS[key]
          return (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              disabled={disabled}
              className={`production-mode-option ${mode === key ? "is-active" : ""}`}
              onClick={() => onModeChange(key)}
            >
              <span>
                <b>{preset.label}</b>
                <small>{preset.eyebrow}</small>
              </span>
              <strong>{preset.range[0]}-{preset.range[1]} 集</strong>
              <em>{preset.description}</em>
            </button>
          )
        })}
      </div>
      <label className="production-target-input">
        <span>目标集数</span>
        <input
          type="number"
          inputMode="numeric"
          min={mode ? PRODUCTION_MODE_PRESETS[mode].range[0] : 1}
          max={mode ? PRODUCTION_MODE_PRESETS[mode].range[1] : 120}
          value={draft}
          disabled={disabled || !mode}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitTarget}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commitTarget()
            }
          }}
          aria-label="目标集数"
        />
        {mode && (
          <small>
            {PRODUCTION_MODE_PRESETS[mode].range[0]}-{PRODUCTION_MODE_PRESETS[mode].range[1]} 集
          </small>
        )}
      </label>
    </fieldset>
  )
}
