'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import SmoothCollapse from './SmoothCollapse'
import {
  fetchGenerationState,
  generateKeyframe,
  selectKeyframe,
} from '@/lib/generation/client'
import { keyframeExportName } from '@/lib/generation/export'
import { publicGenerationError, type ImageAspect } from '@/lib/generation/model'
import type { GeneratedAsset, GenerationTargetType, GenerationTask } from '@/lib/generation/types'
import { isLookEmpty, type LookBook } from '@/lib/look'
import { isAbortError } from '@/lib/api'

interface Props {
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  targetType: GenerationTargetType
  targetId: string
  prompt: string
  aspect: ImageAspect
  actionLabel: string
  look?: LookBook
}

export default function KeyframePanel({
  projectId,
  onEnsureProject,
  targetType,
  targetId,
  prompt,
  aspect,
  actionLabel,
  look,
}: Props) {
  const isPlace = targetType === 'place'
  const [assets, setAssets] = useState<GeneratedAsset[]>([])
  const [lastTask, setLastTask] = useState<GenerationTask | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [referenceCount, setReferenceCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!projectId) {
      setAssets([])
      setLastTask(null)
      setReferenceCount(null)
      return
    }
    let active = true
    const load = () => {
      fetchGenerationState(projectId, targetType, targetId)
        .then((state) => {
          if (!active) return
          setAssets(state.assets)
          setLastTask(state.tasks[0] ?? null)
          if (state.assets.length > 0 && !state.assets.some((asset) => asset.selectedAt)) {
            setHistoryOpen(true)
          }
        })
        .catch(() => {
          if (active) setAssets([])
        })
    }
    const onGenerationUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ targetType?: string; targetId?: string }>).detail
      if (detail?.targetType && detail.targetType !== targetType) return
      if (detail?.targetId && detail.targetId !== targetId) return
      load()
    }
    load()
    window.addEventListener('chengju:generation-updated', onGenerationUpdated)
    return () => {
      active = false
      window.removeEventListener('chengju:generation-updated', onGenerationUpdated)
    }
  }, [projectId, targetId, targetType])

  useEffect(() => () => abortRef.current?.abort(), [])

  const selected = useMemo(() => assets.find((asset) => asset.selectedAt) ?? null, [assets])
  const previewAsset = selected ?? assets[0] ?? null
  const pendingTask = lastTask?.status === 'queued' || lastTask?.status === 'running'
    ? lastTask
    : null

  async function handleGenerate() {
    setError(null)
    setNotice(null)
    setReferenceCount(null)
    if (!prompt.trim()) {
      setError('这一项还没有可用的图像提示词')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    let activeProjectId = projectId
    setGenerating(true)
    try {
      const pid = projectId ?? await onEnsureProject()
      if (!pid) throw new Error('项目还没有保存成功，请重试')
      activeProjectId = pid
      const result = await generateKeyframe({
        projectId: pid,
        targetType,
        targetId,
        prompt: prompt.trim(),
        aspect,
        look,
      }, controller.signal)
      setAssets((prev) => [result.asset, ...prev.filter((item) => item.id !== result.asset.id)])
      setLastTask(result.task)
      setReferenceCount(result.referenceCount)
      if (assets.length > 0) setHistoryOpen(true)
      window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
    } catch (cause) {
      if (isAbortError(cause)) {
        setNotice('已停止等待。通义侧任务可能仍会完成，但不会写入当前项目。')
        if (activeProjectId) {
          setTimeout(() => {
            fetchGenerationState(activeProjectId!, targetType, targetId)
              .then((state) => {
                setLastTask(state.tasks[0] ?? null)
                window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
              })
              .catch(() => {})
          }, 250)
        }
        return
      }
      setError(cause instanceof Error ? cause.message : isPlace ? '场景图生成失败，请重试' : '关键帧生成失败，请重试')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setGenerating(false)
    }
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  async function handleSelect(asset: GeneratedAsset) {
    if (!projectId || selectingId || asset.selectedAt) return
    setSelectingId(asset.id)
    setError(null)
    try {
      const next = await selectKeyframe(projectId, asset.id)
      setAssets((prev) => prev.map((item) => ({
        ...item,
        selectedAt: item.id === next.id ? next.selectedAt : null,
      })))
      window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片采用失败')
    } finally {
      setSelectingId(null)
    }
  }

  const previewClass =
    aspect === 'landscape' ? 'aspect-video' :
      aspect === 'square' ? 'aspect-square' : 'aspect-[9/16]'

  return (
    <section className="keyframe-panel mt-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current text-done-600 [stroke-width:1.6]">
              <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
              <path d="m4.5 13 3.2-3.2 2.6 2.6 1.8-1.8 3.4 3.4M13.5 7.2h.01" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              {isPlace ? '云端场景图' : '云端关键帧'}
            </span>
            <span className="rounded-pill bg-done-100 px-2 py-0.5 text-[9px] font-semibold text-done-800">通义万相</span>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-400">
            {isPlace
              ? '由平台默认生成；会带入当前地点已采用场景图作一致性参考，本地参考图不会上传。'
              : '由平台默认生成；会带入当前项目已采用的关键帧作一致性参考，本地参考图不会上传。'}
          </p>
          <p className={`mt-1 text-[10px] ${isLookEmpty(look) ? 'text-accent-700' : 'text-done-700'}`}>
            {isLookEmpty(look)
              ? '视觉宪法未填写 · 跨角色风格可能漂移'
              : `视觉宪法已带入 · ${[look?.palette, look?.light].filter(Boolean).join(' / ') || '已锁定'}`}
          </p>
          {referenceCount !== null && (
            <p className="mt-1 text-[10px] text-ink-400">
              {referenceCount > 0
                ? `本次已带入 ${referenceCount} 张${isPlace ? '场景参考图' : '项目关键帧'}`
                : `本次没有可用${isPlace ? '场景参考图' : '项目关键帧'}，已按文字生成`}
            </p>
          )}
          {pendingTask && !generating && (
            <p role="status" className="mt-1 text-[10px] text-info-700">
              任务可能仍在运行；刷新后若超过安全时限，系统会标记失败并允许重试。
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void (generating ? handleStop() : handleGenerate())}
          disabled={(!generating && !prompt.trim()) || Boolean(pendingTask && !generating)}
          className="keyframe-generate rounded-chip border border-done-300 bg-done-50 px-2.5 py-1.5 text-[11px]
            font-semibold text-done-900 transition-colors hover:border-done-500 hover:bg-done-100
            disabled:cursor-not-allowed disabled:opacity-45"
        >
          {generating
            ? '停止生成'
            : pendingTask
              ? '任务可能仍在运行'
            : lastTask?.status === 'failed' && !previewAsset
              ? '重试生成'
              : previewAsset ? `再${actionLabel}` : actionLabel}
        </button>
      </div>

      {previewAsset ? (
        <div className="keyframe-asset-summary mt-2.5 min-w-0">
          <div className={`keyframe-preview keyframe-preview-${aspect} overflow-hidden rounded-chip border border-surface-line bg-surface-deep`}>
            <img
              src={previewAsset.downloadUrl || `/api/generated-assets/${previewAsset.id}`}
              alt={`${actionLabel}结果`}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 self-center">
            <p className="text-[10.5px] font-medium text-ink-600">
              {selected ? '已采用' : '候选版本 · 尚未采用'} · {new Date(previewAsset.createdAt).toLocaleString('zh-CN', { hour12: false })}
            </p>
            <p className="mt-1 line-clamp-2 font-mono text-[9.5px] leading-relaxed text-ink-400">
              {previewAsset.model} · {(previewAsset.bytes / 1024).toFixed(0)} KB
            </p>
            <a
              href={previewAsset.downloadUrl}
              download={keyframeExportName(previewAsset)}
              className="mt-1.5 inline-flex min-h-8 items-center text-[10px] font-medium text-done-700 underline-offset-2 hover:underline"
            >
              {isPlace ? '下载场景图' : '下载关键帧'}
            </a>
            {!selected && (
              <button
                type="button"
                onClick={() => void handleSelect(previewAsset)}
                disabled={Boolean(selectingId)}
                className="ml-3 mt-1.5 rounded-chip border border-done-300 bg-done-50 px-2 py-1 text-[10px] font-semibold text-done-900
                  transition-colors hover:bg-done-100 disabled:opacity-50"
              >
                {selectingId === previewAsset.id ? '采用中…' : '采用这张'}
              </button>
            )}
            {assets.length > 1 && (
              <button
                type="button"
                onClick={() => setHistoryOpen((value) => !value)}
                aria-expanded={historyOpen}
                className="ml-3 mt-1.5 text-[10px] text-info-700 underline-offset-2 hover:underline"
              >
                {historyOpen ? '收起历史' : `历史版本 ${assets.length}`}
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 rounded-chip border border-dashed border-surface-line px-2.5 py-2 text-[10.5px] text-ink-400">
          {isPlace ? '还没有场景图。生成后会和当前项目一起保存。' : '还没有关键帧。生成后会和当前项目一起保存。'}
        </p>
      )}

      <SmoothCollapse open={historyOpen}>
        <div className="keyframe-history mt-2 flex gap-2 overflow-x-auto pb-1">
          {assets.map((asset, index) => (
            <button
              key={asset.id}
              type="button"
              disabled={Boolean(selectingId) || Boolean(asset.selectedAt)}
              onClick={() => void handleSelect(asset)}
              title={asset.selectedAt ? '当前采用' : '回选这一版'}
              className={`keyframe-history-item relative w-16 shrink-0 overflow-hidden rounded-chip border ${
                asset.selectedAt ? 'border-done-500' : 'border-surface-line hover:border-info-500'
              } ${selectingId === asset.id ? 'opacity-50' : ''}`}
            >
              <img src={asset.downloadUrl} alt={`历史版本 ${index + 1}`} className={`${previewClass} h-full w-full object-cover`} />
              {asset.selectedAt && (
                <span className="absolute inset-x-0 bottom-0 bg-done-600/90 py-0.5 text-center text-[8px] font-semibold text-white">
                  已采用
                </span>
              )}
            </button>
          ))}
        </div>
      </SmoothCollapse>

      {error && (
        <p role="alert" className="mt-2 rounded-chip bg-accent-50 px-2.5 py-1.5 text-[10.5px] leading-relaxed text-accent-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 rounded-chip bg-surface-soft px-2.5 py-1.5 text-[10.5px] leading-relaxed text-ink-500">
          {notice}
        </p>
      )}
      {!error && lastTask?.status === 'failed' && lastTask.error && (
        <p role="status" className="mt-2 text-[10px] leading-relaxed text-accent-700">
          上次生成失败：{publicGenerationError(lastTask.error)}
        </p>
      )}
      {!error && lastTask?.status === 'canceled' && (
        <p role="status" className="mt-2 text-[10px] leading-relaxed text-ink-400">
          上次任务已停止等待
        </p>
      )}
    </section>
  )
}
