"use client"

import {
  estimateVideoSelectionCost,
  findVideoModel,
  videoPricePerSecond,
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
}

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
}: Props) {
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

  return (
    <div className="video-generation-settings">
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
    </div>
  )
}
