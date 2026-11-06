'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import SmoothCollapse from './SmoothCollapse'
import type { Shot } from '@/lib/assets/types'
import type { GeneratedAsset, GenerationBatch, GenerationTask } from '@/lib/generation/types'
import {
  fetchProjectVideoState,
  generateShotVideoBatch,
  retryVideoTask,
} from '@/lib/video/client'
import { quotaUnitsForCostMicros } from '@/lib/model-pricing'

interface Props {
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  shots: Shot[]
  assets: GeneratedAsset[]
  title: string
}

const PRICE_PER_SECOND = 0.26

function selectedFrameFor(shot: Shot, assets: GeneratedAsset[]): GeneratedAsset | null {
  return assets.find((asset) =>
    (asset.mediaKind ?? 'image') === 'image'
    && asset.targetType === 'shot'
    && asset.targetId === shot.entityId
    && asset.selectedAt
  ) ?? null
}

function latestTasksByTarget(tasks: GenerationTask[]): Map<string, GenerationTask> {
  const result = new Map<string, GenerationTask>()
  for (const task of [...tasks].sort((a, b) => b.createdAt - a.createdAt)) {
    if (task.mediaKind !== 'video' || result.has(task.targetId)) continue
    result.set(task.targetId, task)
  }
  return result
}

function isPending(task: GenerationTask | undefined): boolean {
  return task?.status === 'queued' || task?.status === 'running'
}

function yuan(micros: number): string {
  return (Math.max(0, micros) / 1_000_000).toFixed(2)
}

export default function BatchVideoPanel({
  projectId,
  onEnsureProject,
  shots,
  assets,
  title,
}: Props) {
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [batches, setBatches] = useState<GenerationBatch[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const targets = useMemo(() => shots.map((shot) => {
    const frame = selectedFrameFor(shot, assets)
    const prompt = (shot.prompt || shot.action || shot.scene).trim()
    return {
      key: shot.id,
      targetId: shot.entityId,
      label: `第 ${shot.shot} 镜 · ${shot.scene || '场景未标注'}`,
      detail: `${shot.episode > 0 ? `第 ${shot.episode} 集` : '未标注集'} · ${shot.params.duration}s · ${shot.params.ratio}`,
      sourceAssetId: frame?.id ?? null,
      prompt,
      duration: shot.params.duration,
      ratio: shot.params.ratio,
      reason: !prompt
        ? '缺镜头提示词'
        : !frame
          ? '先去分镜属性采用首帧'
          : null,
    }
  }), [assets, shots])
  const readyTargets = useMemo(
    () => targets.filter((target) => !target.reason),
    [targets],
  )
  const latestByTarget = useMemo(() => latestTasksByTarget(tasks), [tasks])
  const readySignature = readyTargets.map((target) => target.key).join('|')
  const selectedTargets = targets.filter((target) =>
    selected.has(target.key) && !target.reason && !isPending(latestByTarget.get(target.targetId))
  )
  const totalSeconds = selectedTargets.reduce((sum, target) => sum + Math.max(1, target.duration), 0)
  const estimatedCost = totalSeconds * PRICE_PER_SECOND
  const relevantTasks = targets
    .map((target) => latestByTarget.get(target.targetId))
    .filter((task): task is GenerationTask => Boolean(task))
  const pendingCount = relevantTasks.filter(isPending).length
  const finishedCount = relevantTasks.filter((task) =>
    task.status === 'succeeded' || task.status === 'failed' || task.status === 'canceled'
  ).length
  const progress = relevantTasks.length > 0
    ? Math.round((finishedCount / relevantTasks.length) * 100)
    : 0
  const relevantBatchIds = new Set(
    relevantTasks.flatMap((task) => task.batchId ? [task.batchId] : []),
  )
  const relevantBatch = batches.find((batch) => relevantBatchIds.has(batch.id)) ?? null

  const refresh = useCallback(async () => {
    if (!projectId) {
      setTasks([])
      setBatches([])
      return
    }
    const state = await fetchProjectVideoState(projectId)
    const targetIds = new Set(shots.map((shot) => shot.entityId))
    setTasks(state.tasks.filter((task) => targetIds.has(task.targetId)))
    setBatches(state.batches)
  }, [projectId, shots])

  useEffect(() => {
    void refresh().catch(() => undefined)
    const onUpdated = () => { void refresh().catch(() => undefined) }
    window.addEventListener('chengju:generation-updated', onUpdated)
    return () => window.removeEventListener('chengju:generation-updated', onUpdated)
  }, [refresh])

  useEffect(() => {
    if (pendingCount === 0) return
    const timer = window.setInterval(() => {
      refresh()
        .then(() => window.dispatchEvent(new CustomEvent('chengju:generation-updated')))
        .catch(() => undefined)
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [pendingCount, refresh])

  useEffect(() => {
    if (pendingCount > 0) return
    setSelected((current) => {
      const available = new Set(readyTargets.map((target) => target.key))
      const retained = [...current].filter((key) => available.has(key))
      return new Set(retained.length > 0 ? retained : readyTargets.map((target) => target.key))
    })
  }, [pendingCount, readySignature])

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function startBatch() {
    if (starting || selectedTargets.length === 0) return
    setStarting(true)
    setError(null)
    setNotice(null)
    try {
      const pid = projectId ?? await onEnsureProject()
      if (!pid) throw new Error('项目还没有保存成功，请重试')
      const result = await generateShotVideoBatch({
        projectId: pid,
        shots: selectedTargets.map((target) => ({
          targetId: target.targetId,
          sourceAssetId: target.sourceAssetId!,
          prompt: target.prompt,
          duration: target.duration,
          ratio: target.ratio,
        })),
        model: 'MiniMax-H3-Lite',
        resolution: '768P',
        budgetLimitMicros: Math.ceil(estimatedCost * 1_000_000),
        idempotencyKey: crypto.randomUUID(),
      })
      setTasks((current) => [...result.tasks, ...current])
      if (result.batch) {
        setBatches((current) => [
          result.batch!,
          ...current.filter((batch) => batch.id !== result.batch!.id),
        ])
      }
      const skipped = result.blocked.length + result.failures.length
      setNotice(
        `已提交 ${result.tasks.length} 个视频任务${skipped > 0 ? `，${skipped} 镜未提交` : ''}。可以继续切换菜单。`,
      )
      if (result.failures.length > 0) {
        setError(
          `有 ${result.failures.length} 镜提交失败：${result.failures
            .map((failure) => failure.reason)
            .join('；')}`,
        )
      }
      window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量视频提交失败')
    } finally {
      setStarting(false)
    }
  }

  async function retry(task: GenerationTask) {
    if (!projectId || retryingId) return
    setRetryingId(task.id)
    setError(null)
    try {
      const result = await retryVideoTask(projectId, task.id)
      setTasks((current) => [result.task, ...current])
      setNotice('失败镜头已重新提交。')
      window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '视频重试失败')
    } finally {
      setRetryingId(null)
    }
  }

  if (shots.length === 0) return null

  return (
    <section className="batch-generation batch-video-panel min-w-0" aria-label={title}>
      <div className="batch-generation-head">
        <div className="batch-generation-heading">
          <span className="batch-generation-mark" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]">
              <rect x="2.5" y="4" width="15" height="12" rx="1.5" />
              <path d="m8 7 5 3-5 3V7Z" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
              <span className="font-mono text-[10.5px] text-ink-400">{readyTargets.length} 镜可生成</span>
              {targets.length > readyTargets.length && (
                <span className="text-[10.5px] text-accent-700">{targets.length - readyTargets.length} 镜缺首帧</span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
              只使用分镜中已采用的首帧；每镜独立提交，结果先保存为候选。
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="batch-generation-toggle"
        >
          {open ? '收起选择' : '选择视频镜头'}
        </button>
      </div>

      <div className="batch-generation-policy" aria-label="批量视频生成规则">
        <span>逐镜提交</span>
        <span>独立任务</span>
        <span>不会自动采用</span>
        <span>仅服务端首帧</span>
      </div>

      <SmoothCollapse open={open}>
        <div className="batch-generation-selector">
          <div className="batch-generation-selector-head">
            <span>准备状态 · {targets.length} 镜</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(readyTargets.map((target) => target.key)))}
              >
                全选可生成
              </button>
              <button type="button" onClick={() => setSelected(new Set())}>清空</button>
            </span>
          </div>
          <div className="batch-generation-list">
            {targets.map((target) => {
              const task = latestByTarget.get(target.targetId)
              const checked = selected.has(target.key) && !target.reason
              return (
                <div
                  key={target.key}
                  className={`batch-generation-row ${checked ? 'is-selected' : ''} ${target.reason ? 'is-blocked' : ''}`}
                >
                  <label className="batch-generation-target">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={Boolean(target.reason) || isPending(task)}
                      onChange={() => toggle(target.key)}
                    />
                    <span className="min-w-0">
                      <span className="batch-generation-name">{target.label}</span>
                      <span className="batch-generation-detail">{target.detail}</span>
                    </span>
                  </label>
                  <div className="batch-generation-state">
                    {target.reason ? (
                      <span className="is-blocked">{target.reason}</span>
                    ) : task ? (
                      <span className={`is-${task.status}`}>
                        {task.status === 'queued'
                          ? '排队中'
                          : task.status === 'running'
                            ? '生成中'
                            : task.status === 'succeeded'
                              ? '候选已保存'
                              : task.status === 'failed'
                                ? '失败'
                                : '已取消'}
                      </span>
                    ) : (
                      <span>可生成</span>
                    )}
                    {(task?.status === 'failed' || task?.status === 'canceled') && (
                      <button
                        type="button"
                        disabled={Boolean(retryingId)}
                        onClick={() => void retry(task)}
                      >
                        {retryingId === task.id ? '重试中…' : '重试'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="batch-generation-footer">
            <div className="min-w-0">
              <p>
                已选 <b>{selectedTargets.length}</b> 镜 · {totalSeconds} 秒 · 约 <b>¥{estimatedCost.toFixed(2)}</b>
                {' '}· {quotaUnitsForCostMicros(estimatedCost * 1_000_000)} 创作额度
              </p>
              <p>MiniMax H3 Lite 768P，结果不会覆盖已采用视频。</p>
            </div>
            <button
              type="button"
              className="batch-generation-run"
              disabled={selectedTargets.length === 0 || starting}
              onClick={() => void startBatch()}
            >
              {starting ? '提交中…' : `开始生成 ${selectedTargets.length} 镜`}
            </button>
          </div>
        </div>
      </SmoothCollapse>

      {relevantTasks.length > 0 && (
        <div className="batch-generation-progress" role="status" aria-live="polite">
          <div className="batch-generation-progress-line">
            <span>{pendingCount > 0 ? `视频任务进行中 · ${finishedCount}/${relevantTasks.length}` : `已结束 · ${finishedCount}/${relevantTasks.length}`}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {relevantBatch && (
                <span className="font-mono text-[10.5px] text-ink-400">
                  预留 ¥{yuan(relevantBatch.reservedCostMicros)} · 实付 ¥{yuan(relevantBatch.actualCostMicros)}
                </span>
              )}
              <span>{progress}%</span>
            </span>
          </div>
          <div className="batch-generation-track" aria-hidden="true">
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </div>
      )}

      {notice && <p className="batch-generation-notice" role="status">{notice}</p>}
      {error && <p className="batch-generation-error-global" role="alert">{error}</p>}
    </section>
  )
}
