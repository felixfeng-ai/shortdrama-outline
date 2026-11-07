"use client"

import type { ProjectType } from "@/lib/production/types"

interface Props {
  value: ProjectType | null
  onChange: (value: ProjectType) => void
  disabled?: boolean
}

const PROJECT_TYPE_OPTIONS: Array<{
  value: ProjectType
  label: string
  description: string
  available: boolean
}> = [
  {
    value: "quick_video",
    label: "快速出片",
    description: "一句话或一组素材直接生成短视频，不强制进入六步。",
    available: true,
  },
  {
    value: "drama",
    label: "短剧生产",
    description: "从来源、Canon 到分镜、视频和整季交付的连续生产。",
    available: true,
  },
  {
    value: "marketing",
    label: "营销视频",
    description: "复用生产事实与素材，生成广告和营销变体。",
    available: false,
  },
]

export default function ProjectTypePicker({ value, onChange, disabled = false }: Props) {
  const availableOptions = PROJECT_TYPE_OPTIONS.filter((option) => option.available)

  return (
    <fieldset className="production-type-picker">
      <legend>项目类型</legend>
      <div role="group" aria-label="选择项目类型">
        {availableOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={value === option.value ? "is-active" : ""}
          >
            <span>
              <b>{option.label}</b>
            </span>
            <em>{option.description}</em>
          </button>
        ))}
      </div>
      <p className="production-type-future">营销视频 · 后续开放</p>
    </fieldset>
  )
}
