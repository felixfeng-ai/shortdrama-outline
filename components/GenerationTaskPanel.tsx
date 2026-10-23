'use client'

import { useEffect, useMemo, useState } from 'react'

import SmoothCollapse from './SmoothCollapse'
import type { Shot, VisualCharacter } from '@/lib/assets/types'
import {
  fetchProjectGenerationAssets,
  generateKeyframe,
  selectKeyframe,
} from '@/lib/generation/client'
import { publicGenerationError } from '@/lib/generation/model'
import {
  generationTaskTargetLabel,
  selectRetryableTasks,
  summarizeGenerationTasks,
} from '@/lib/generation/task-view'
import type { GeneratedAsset, GenerationStatus, GenerationTask } from '@/lib/generation/types'
import type { LookBook } from '@/lib/look'

interface Props {
  projectId: string | null
  visuals: VisualCharacter[]
  shots: Shot[]
  look: LookBook
}

const STATUS: Record<GenerationStatus, { label: string; dot: string; text: string }> = {
  queued: { label: '等待', dot: 'bg-ink-300', text: 'text-ink-500' },
  running: { label: '运行中', dot: 'bg-info-500', text: 'text-info-700' },
  succeeded: { label: '已生成', dot: 'bg-done-500', text: 'text-done-700' },
  failed: { label: '失败', dot: 'bg-accent-500', text: 'text-accent-700' },
  canceled: { label: '已停止', dot: 'bg-ink-400', text: 'text-ink-500' },
}

function notifyUpdated() {
  window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
}

export default function GenerationTaskPanel({ projectId, visuals, shots, look }: Props) {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [assets, setAssets] = useState<GeneratedAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [confirmingBatch, setConfirmingBatch] = useState(false)

  useEffect(() => {
    if (!projectId) {
      setTasks([])
      setAssets([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const state = await fetchProjectGenerationAssets(projectId)
        if (!cancelled) {
          setTasks(state.tasks)
          setAssets(state.assets)
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '任务读取失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const onUpdate = () => { void load() }
    void load()
    window.addEventListener('chengju:generation-updated', onUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('chengju:generation-updated', onUpdate)
    }
  }, [projectId])

  const summary = useMemo(() => summarizeGenerationTasks(tasks), [tasks])
  const retryable = useMemo(() => selectRetryableTasks(tasks), [tasks])
  const retryableIds = useMemo(() => new Set(retryable.map((item) => item.id)), [retryable])
  const assetByTask = useMemo(
    () => new Map(assets.map((asset) => [asset.taskId, asset])),
    [assets],
  )

  async function retryOne(task: GenerationTask) {
    if (!projectId) throw new Error('项目还没有保存')
    const shot = shots.find((item) => item.entityId === task.targetId || item.id === task.targetId)
    const aspect = task.targetType === 'character'
      ? 'portrait'
      : shot?.params.ratio === '16:9' ? 'landscape' : 'vertical'
    return generateKeyframe({
      projectId,
      targetType: task.targetType,
      targetId: task.targetId,
      prompt: task.prompt,
      aspect,
      look,
    })
  }

  async function handleRetry(task: GenerationTask) {
    if (retryingId) return
    setRetryingId(task.id)
    setError(null)
    try {
      await retryOne(task)
      notifyUpdated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重试失败')
    } finally {
      setRetryingId(null)
    }
  }

  async function handleBatchRetry() {
    if (!confirmingBatch) {
      setConfirmingBatch(true)
      return
    }
    setConfirmingBatch(false)
    setError(null)
    try {
      for (const task of retryable) {
        setRetryingId(task.id)
        await retryOne(task)
      }
      notifyUpdated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量重试中断')
      notifyUpdated()
    } finally {
      setRetryingId(null)
    }
  }

  async function handleSelect(asset: GeneratedAsset) {
    if (!projectId || asset.selectedAt) return
    try {
      await selectKeyframe(projectId, asset.id)
      notifyUpdated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '采用失败')
    }
  }

  if (!projectId || tasks.length === 0) return null

  return (
    <div className="generation-task-center">
      <button
        type="button"
        className="generation-task-summary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="generation-task-title">生成任务</span>
        <span className="generation-task-count">{summary.total}</span>
        <span className="generation-task-label">{loading ? '同步中…' : summary.label}</span>
        <span className="generation-task-toggle">{open ? '收起' : '查看'}</span>
      </button>

      <SmoothCollapse open={open}>
        <div className="generation-task-body">
          {retryable.length > 1 && (
            <div className="generation-task-batch">
              <span>有 {retryable.length} 个失败或停止的最新任务</span>
              <span className="flex items-center gap-1.5">
                <button type="button" onClick={() => void handleBatchRetry()} disabled={Boolean(retryingId)}>
                  {confirmingBatch ? `确认重试 ${retryable.length} 项` : '重试失败项'}
                </button>
                {confirmingBatch && (
                  <button type="button" onClick={() => setConfirmingBatch(false)}>取消</button>
                )}
              </span>
            </div>
          )}

          <ul className="generation-task-list">
            {tasks.slice(0, 20).map((task) => {
              const status = STATUS[task.status]
              const asset = task.assetId ? assetByTask.get(task.id) : null
              const retryableTask = retryableIds.has(task.id)
              return (
                <li key={task.id} className="generation-task-row">
                  <span className={`generation-task-dot ${status.dot}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate text-[11px] font-medium text-ink-700">
                        {generationTaskTargetLabel(task, visuals, shots)}
                      </span>
                      <span className={`text-[9.5px] font-medium ${status.text}`}>{status.label}</span>
                      <time className="font-mono text-[9px] text-ink-300">
                        {new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false })}
                      </time>
                    </div>
                    {task.error && (
                      <p className="mt-0.5 truncate text-[9.5px] text-accent-700" title={task.error}>
                        {publicGenerationError(task.error)}
                      </p>
                    )}
                  </div>
                  {asset && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <img
                        src={asset.downloadUrl}
                        alt=""
                        className="h-8 w-10 rounded-[3px] object-cover"
                      />
                      {!asset.selectedAt && (
                        <button type="button" className="generation-task-action" onClick={() => void handleSelect(asset)}>
                          采用
                        </button>
                      )}
                    </div>
                  )}
                  {retryableTask && (
                    <button
                      type="button"
                      className="generation-task-action shrink-0"
                      disabled={Boolean(retryingId)}
                      onClick={() => void handleRetry(task)}
                    >
                      {retryingId === task.id ? '重试中…' : '重试'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {error && <p role="alert" className="generation-task-error">{error}</p>}
        </div>
      </SmoothCollapse>
    </div>
  )
}
