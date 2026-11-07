'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchGenerationState } from '@/lib/generation/client'
import type { GeneratedAsset, GenerationTask } from '@/lib/generation/types'
import {
  cancelVideoTask,
  fetchShotVideoState,
  generateShotVideo,
  retryVideoTask,
  selectVideo,
} from '@/lib/video/client'
import {
  estimateVideoSelectionCost,
  supportsVideoDuration,
} from '@/lib/video/catalog'
import { useVideoCapabilities } from '@/lib/video/use-video-capabilities'
import { quotaUnitsForCostMicros } from '@/lib/model-pricing'
import VideoGenerationSettings from './VideoGenerationSettings'

interface Props {
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  targetId: string
  prompt: string
  duration: number
  ratio: string
}

function isPending(task: GenerationTask | null): boolean {
  return task?.status === 'queued' || task?.status === 'running'
}

export default function ShotVideoPanel({
  projectId,
  onEnsureProject,
  targetId,
  prompt,
  duration,
  ratio,
}: Props) {
  const [mode, setMode] = useState<'image-to-video' | 'text-to-video'>('image-to-video')
  const [frame, setFrame] = useState<GeneratedAsset | null>(null)
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [assets, setAssets] = useState<GeneratedAsset[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const videoSettings = useVideoCapabilities()

  const refresh = useCallback(async () => {
    if (!projectId) {
      setFrame(null)
      setTasks([])
      setAssets([])
      return
    }
    const [imageState, videoState] = await Promise.all([
      fetchGenerationState(projectId, 'shot', targetId),
      fetchShotVideoState(projectId, targetId),
    ])
    setFrame(imageState.assets.find((asset) => asset.selectedAt) ?? null)
    setTasks(videoState.tasks)
    setAssets(videoState.assets)
  }, [projectId, targetId])

  useEffect(() => {
    let active = true
    const load = () => {
      refresh().catch(() => {
        if (active) setTasks([])
      })
    }
    const onUpdated = () => load()
    load()
    window.addEventListener('chengju:generation-updated', onUpdated)
    return () => {
      active = false
      window.removeEventListener('chengju:generation-updated', onUpdated)
    }
  }, [refresh])

  useEffect(() => () => abortRef.current?.abort(), [])

  const latestTask = tasks[0] ?? null
  const pendingTask = isPending(latestTask) ? latestTask : null

  useEffect(() => {
    if (!pendingTask) return
    const timer = window.setInterval(() => {
      refresh()
        .then(() => window.dispatchEvent(new CustomEvent('chengju:generation-updated')))
        .catch(() => undefined)
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [pendingTask, refresh])

  const selected = useMemo(() => assets.find((asset) => asset.selectedAt) ?? null, [assets])
  const preview = selected ?? assets[0] ?? null
  const estimatedCostMicros = videoSettings.capabilities
    ? estimateVideoSelectionCost(
        videoSettings.capabilities,
        videoSettings.model,
        videoSettings.resolution,
        duration,
      )
    : null
  const durationSupported = videoSettings.capabilities
    ? supportsVideoDuration(videoSettings.capabilities, videoSettings.model, duration)
    : false
  const capabilityBlocked = videoSettings.loading
    || !videoSettings.capabilities?.enabled
    || !videoSettings.model
    || !videoSettings.resolution
    || !durationSupported
    || estimatedCostMicros === null
  const frameBlocked = mode === 'image-to-video' && !frame
  const blocked = capabilityBlocked || frameBlocked
  const retryable = latestTask?.status === 'failed' || latestTask?.status === 'canceled'
  const costLabel = estimatedCostMicros === null
    ? '费用读取中'
    : `草片约 ¥${(estimatedCostMicros / 1_000_000).toFixed(2)} · ${quotaUnitsForCostMicros(estimatedCostMicros)} 创作额度`

  async function handleGenerate() {
    if (submitting || pendingTask || blocked) return
    setSubmitting(true)
    setError(null)
    setNotice(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const pid = projectId ?? await onEnsureProject()
      if (!pid) throw new Error('项目还没有保存成功，请重试')
      const result = await generateShotVideo({
        projectId: pid,
        targetId,
        sourceAssetId: mode === 'image-to-video' ? frame?.id : null,
        prompt,
        mode,
        model: videoSettings.model,
        resolution: videoSettings.resolution,
        duration,
        ratio,
        maxBudgetMicros: estimatedCostMicros!,
        autoSelect: false,
        idempotencyKey: crypto.randomUUID(),
      }, controller.signal)
      setTasks((current) => [result.task, ...current.filter((task) => task.id !== result.task.id)])
      setNotice('视频任务已提交。切换菜单不会中断，返回后会继续同步。')
      window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') {
        setNotice('已停止等待提交结果；供应商任务可能仍然继续。')
      } else {
        setError(cause instanceof Error ? cause.message : '视频任务提交失败')
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setSubmitting(false)
    }
  }

  async function handleSelect(asset: GeneratedAsset) {
    if (!projectId || selectingId || asset.selectedAt) return
    setSelectingId(asset.id)
    setError(null)
    try {
      const next = await selectVideo(projectId, asset.id)
      setAssets((current) => current.map((item) => ({
        ...item,
        selectedAt: item.id === next.id ? next.selectedAt : null,
      })))
      window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '视频采用失败')
    } finally {
      setSelectingId(null)
    }
  }

  async function handleCancel() {
    if (!projectId || !pendingTask) return
    setError(null)
    try {
      const task = await cancelVideoTask(projectId, pendingTask.id)
      setTasks((current) => current.map((item) => item.id === task.id ? task : item))
      setNotice(task.status === 'canceled' ? '已取消视频任务。' : '供应商已开始处理，暂不能取消。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消失败')
    }
  }

  async function handleRetry() {
    if (!projectId || !latestTask || retrying) return
    setRetrying(true)
    setError(null)
    setNotice(null)
    try {
      const result = await retryVideoTask(projectId, latestTask.id)
      setTasks((current) => [result.task, ...current])
      setNotice(result.reused ? '已恢复现有重试任务。' : '失败任务已重新提交。')
      window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '视频重试失败')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <section className="shot-video-panel mt-3 min-w-0" aria-label="镜头视频">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current text-info-700 [stroke-width:1.6]">
              <rect x="2.5" y="4" width="15" height="12" rx="1.5" />
              <path d="m8 7 5 3-5 3V7Z" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              镜头视频
            </span>
            <span className="rounded-pill bg-info-100 px-2 py-0.5 text-[9px] font-semibold text-info-800">
              {videoSettings.model || '读取模型'} · {videoSettings.resolution || '--'}
            </span>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-400">
            {costLabel}，结果先保存为候选；切换菜单后任务仍在服务端继续。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="shot-video-mode flex w-full rounded-chip border border-surface-line bg-surface-soft p-0.5 sm:w-auto" role="group" aria-label="视频生成方式">
            <button
              type="button"
              aria-pressed={mode === 'image-to-video'}
              onClick={() => setMode('image-to-video')}
              className={`rounded-[4px] px-2 py-1 text-[10px] font-medium ${
                mode === 'image-to-video' ? 'bg-surface-card text-ink-900 shadow-sm' : 'text-ink-500'
              }`}
            >
              图生视频
            </button>
            <button
              type="button"
              aria-pressed={mode === 'text-to-video'}
              onClick={() => setMode('text-to-video')}
              className={`rounded-[4px] px-2 py-1 text-[10px] font-medium ${
                mode === 'text-to-video' ? 'bg-surface-card text-ink-900 shadow-sm' : 'text-ink-500'
              }`}
            >
              文生视频
            </button>
          </div>
          {pendingTask ? (
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="shot-video-generate w-full rounded-chip border border-surface-line px-2.5 py-1.5 text-[10.5px] font-semibold text-ink-500 sm:w-auto"
            >
              取消任务
            </button>
          ) : retryable ? (
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={retrying}
              className="shot-video-generate w-full rounded-chip border border-info-300 bg-info-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-info-900 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              {retrying ? '重新提交中…' : '重试失败任务'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={submitting || blocked || !prompt.trim()}
              className="shot-video-generate w-full rounded-chip border border-info-300 bg-info-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-info-900 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              {submitting
                ? '提交中…'
                : frameBlocked
                  ? '先采用首帧'
                  : capabilityBlocked
                    ? '视频设置不可用'
                    : '生成视频'}
            </button>
          )}
        </div>
      </div>

      <VideoGenerationSettings
        capabilities={videoSettings.capabilities}
        model={videoSettings.model}
        resolution={videoSettings.resolution}
        duration={duration}
        loading={videoSettings.loading}
        error={videoSettings.error}
        disabled={Boolean(pendingTask) || submitting || retrying}
        onModelChange={videoSettings.setModel}
        onResolutionChange={videoSettings.setResolution}
      />

      {pendingTask && (
        <p role="status" className="mt-2 rounded-chip bg-info-50 px-2.5 py-1.5 text-[10.5px] text-info-800">
          视频正在{pendingTask.status === 'queued' ? '排队' : '生成'}，可离开当前页面；返回时会继续同步。
        </p>
      )}

      {preview ? (
        <div className="shot-video-summary mt-2.5 min-w-0">
          <video
            key={preview.id}
            src={preview.downloadUrl}
            controls
            preload="metadata"
            className={`shot-video-preview ${ratio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}
          />
          <div className="min-w-0 self-center">
            <p className="text-[10.5px] font-medium text-ink-600">
              {selected ? '已采用' : '候选视频 · 尚未采用'}
            </p>
            <p className="mt-1 text-[9.5px] text-ink-400">
              {preview.durationMs ? `${(preview.durationMs / 1000).toFixed(1)} 秒` : '时长待校验'}
              {' · '}
              {preview.model}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <a
                href={preview.downloadUrl}
                download={`shot-${targetId}.mp4`}
                className="text-[10px] font-medium text-info-700 underline-offset-2 hover:underline"
              >
                下载 MP4
              </a>
              {!selected && (
                <button
                  type="button"
                  onClick={() => void handleSelect(preview)}
                  disabled={Boolean(selectingId)}
                  className="rounded-chip border border-info-300 bg-info-50 px-2 py-1 text-[10px] font-semibold text-info-900 disabled:opacity-50"
                >
                  {selectingId === preview.id ? '采用中…' : '采用这条'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-2 rounded-chip border border-dashed border-surface-line px-2.5 py-2 text-[10.5px] text-ink-400">
          还没有镜头视频。生成后会和当前项目一起保存。
        </p>
      )}

      {assets.length > 1 && (
        <div className="shot-video-history mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="视频候选历史">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              disabled={Boolean(selectingId) || Boolean(asset.selectedAt)}
              onClick={() => void handleSelect(asset)}
              className={`relative w-24 shrink-0 overflow-hidden rounded-chip border ${
                asset.selectedAt ? 'border-info-500' : 'border-surface-line hover:border-info-400'
              }`}
              title={asset.selectedAt ? '当前采用' : '采用这条视频'}
            >
              <video
                src={asset.downloadUrl}
                muted
                playsInline
                preload="metadata"
                className={`${ratio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} h-full w-full object-cover`}
              />
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[7px] text-white">AI</span>
              {asset.selectedAt && (
                <span className="absolute inset-x-0 bottom-0 bg-info-700/90 py-0.5 text-center text-[8px] font-semibold text-white">
                  已采用
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {latestTask && (
        <p className="mt-2 text-[10px] text-ink-400">
          本任务：预计 ¥{((latestTask.estimatedCostMicros ?? 0) / 1_000_000).toFixed(2)}
          {' · '}
          已结算 ¥{((latestTask.actualCostMicros ?? 0) / 1_000_000).toFixed(2)}
        </p>
      )}

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
      {!error && latestTask?.status === 'failed' && latestTask.error && (
        <p role="status" className="mt-2 text-[10px] leading-relaxed text-accent-700">
          上次视频生成失败：{latestTask.error}
        </p>
      )}
    </section>
  )
}
