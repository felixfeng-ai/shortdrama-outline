"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { fetchVideoCapabilities } from "./client.ts"
import {
  findVideoModel,
  resolveVideoSelection,
  videoPricePerSecond,
} from "./catalog.ts"
import type { PublicVideoCapabilities } from "./model.ts"

/**
 * Web 视频能力状态钩子。
 * 加载失败时不回退到硬编码模型，而是把错误交给面板阻断提交，避免价格和模型漂移。
 */
export function useVideoCapabilities() {
  const [capabilities, setCapabilities] = useState<PublicVideoCapabilities | null>(null)
  const [model, setModelValue] = useState("")
  const [resolution, setResolutionValue] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchVideoCapabilities()
      .then((next) => {
        if (!active) return
        const selected = resolveVideoSelection(next)
        setCapabilities(next)
        setModelValue(selected.model)
        setResolutionValue(selected.resolution)
        setError(null)
      })
      .catch((cause) => {
        if (!active) return
        setCapabilities(null)
        setError(cause instanceof Error ? cause.message : "视频能力读取失败")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedModel = useMemo(
    () => capabilities ? findVideoModel(capabilities, model) : null,
    [capabilities, model],
  )
  const pricePerSecond = useMemo(
    () => capabilities ? videoPricePerSecond(capabilities, model, resolution) : null,
    [capabilities, model, resolution],
  )

  const setModel = useCallback((nextModel: string) => {
    if (!capabilities) return
    // 模型和分辨率必须成对合法，不能先把模型切过去再留下不支持的分辨率。
    const selected = resolveVideoSelection(capabilities, nextModel, resolution)
    setModelValue(selected.model)
    setResolutionValue(selected.resolution)
  }, [capabilities, resolution])

  const setResolution = useCallback((nextResolution: string) => {
    if (!capabilities || !selectedModel?.resolutions.includes(
      nextResolution as (typeof selectedModel.resolutions)[number],
    )) return
    setResolutionValue(nextResolution)
  }, [capabilities, selectedModel])

  return {
    capabilities,
    model,
    resolution,
    selectedModel,
    pricePerSecond,
    loading,
    error,
    setModel,
    setResolution,
  }
}
