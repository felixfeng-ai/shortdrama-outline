"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  estimateVideoSelectionCost,
  findVideoModel,
  recommendVideoSelection,
  videoPricePerSecond,
  type VideoQualityGoal,
} from "@/lib/video/catalog"
import type { PublicVideoCapabilities } from "@/lib/video/model"

/**
 * 视频模型设置唯一读取服务端公开能力。
 * 单镜传入 duration 时校验模型时长；批量只显示每秒价格，由父组件汇总总预算。
 */
interface Props {
  capabilities: PublicVideoCapabilities | null
  model: string
  resolution: string
  duration?: number
  loading: boolean
  error: string | null
  disabled?: boolean
  onModelChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onApplySelection?: (model: string, resolution: string) => void
}

const GOALS: Array<{ id: VideoQualityGoal; label: string }> = [
  { id: "draft", label: "试片" },
  { id: "standard", label: "标准" },
  { id: "final", label: "成片" },
]

export default function VideoGenerationSettings({
  capabilities,
  model,
  resolution,
  duration,
  loading,
  error,
  disabled = false,
  onModelChange,
  onResolutionChange,
  onApplySelection,
}: Props) {
  const [goal, setGoal] = useState<VideoQualityGoal>("standard")
  const lastApplied = useRef("")
  const selected = capabilities ? findVideoModel(capabilities, model) : null
  const price = capabilities
    ? videoPricePerSecond(capabilities, model, resolution)
    : null
  const estimated = capabilities
    ? duration === undefined
      ? null
      : estimateVideoSelectionCost(capabilities, model, resolution, duration)
    : null
  const unavailable = Boolean(error) || (!loading && !capabilities?.enabled)
  const recommendation = useMemo(() => {
    if (!capabilities?.enabled || duration === undefined) return null
    try {
      return recommendVideoSelection({ capabilities, duration, goal })
    } catch {
      return null
    }
  }, [capabilities, duration, goal])

  // 每个时长与质量目标只自动应用一次；用户手动覆盖后不能在下一次渲染被抢回。
  useEffect(() => {
    if (!recommendation || disabled || duration === undefined) return
    const key = [
      duration,
      goal,
      recommendation.model,
      recommendation.resolution,
    ].join(":")
    if (lastApplied.current === key) return
    lastApplied.current = key
    if (model !== recommendation.model || resolution !== recommendation.resolution) {
      onApplySelection?.(recommendation.model, recommendation.resolution)
    }
  }, [
    disabled,
    duration,
    goal,
    model,
    onApplySelection,
    recommendation,
    resolution,
  ])

  function applyRecommendation() {
    if (!recommendation) return
    onApplySelection?.(recommendation.model, recommendation.resolution)
  }

  return (
    <div className="video-generation-settings">
      {duration !== undefined && (
        <div className="video-generation-goal" role="group" aria-label="视频质量目标">
          {GOALS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={goal === item.id}
              disabled={disabled || loading || !capabilities?.enabled}
              onClick={() => setGoal(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <label>
        <span>视频模型</span>
        <select
          value={model}
          disabled={disabled || loading || !capabilities?.enabled}
          onChange={(event) => onModelChange(event.target.value)}
          aria-label="选择视频模型"
        >
          {!capabilities && <option value="">读取中</option>}
          {capabilities?.models.map((item) => (
            <option key={item.id} value={item.id}>{item.id}</option>
          ))}
        </select>
      </label>

      <label>
        <span>分辨率</span>
        <select
          value={resolution}
          disabled={disabled || loading || !selected}
          onChange={(event) => onResolutionChange(event.target.value)}
          aria-label="选择视频分辨率"
        >
          {(selected?.resolutions ?? []).map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>

      <p className={unavailable ? "is-error" : ""}>
        {loading
          ? "正在读取视频能力…"
          : error
            ? error
            : !capabilities?.enabled
              ? "视频生成尚未启用"
              : duration !== undefined && estimated === null
                ? `当前模型不支持 ${duration} 秒镜头`
                : estimated === null
                  ? price === null
                    ? "价格不可用"
                    : `¥${price.toFixed(2)}/秒`
                  : `¥${price?.toFixed(2)}/秒 · 预计 ¥${(estimated / 1_000_000).toFixed(2)}`}
      </p>
      {recommendation && (
        <div className="video-generation-routing" role="status">
          <div>
            <span>智能推荐 · {GOALS.find((item) => item.id === goal)?.label}</span>
            <b>{recommendation.model} · {recommendation.resolution}</b>
            <small>{recommendation.reason}</small>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={applyRecommendation}
          >
            使用推荐
          </button>
        </div>
      )}
    </div>
  )
}
