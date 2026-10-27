'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

import SmoothCollapse from './SmoothCollapse'
import {
  eligibleBatchTargets,
  estimateBatchDuration,
  isBatchTargetReady,
  runBatchGeneration,
  type BatchGenerationStatus,
  type BatchGenerationTarget,
} from '@/lib/generation/batch'
import { generateKeyframe, selectKeyframe } from '@/lib/generation/client'
import type { GeneratedAsset } from '@/lib/generation/types'
import type { LookBook } from '@/lib/look'

interface Props {
  title?: string
  description: string
  targets: BatchGenerationTarget[]
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  look: LookBook
}

const STATUS_LABEL: Record<BatchGenerationStatus, string> = {
  waiting: '排队中',
  running: '生成中',
  succeeded: '候选已保存',
  failed: '生成失败',
  canceled: '已停止',
}

export default function BatchGenerationPanel({
  title = '批量生成',
  description,
  targets,
  projectId,
  onEnsureProject,
  look,
}: Props) {
  const listId = useId()
  const eligible = useMemo(() => eligibleBatchTargets(targets), [targets])
  const readySignature = useMemo(
    () => targets.map((item) => `${item.key}:${isBatchTargetReady(item) ? 1 : 0}`).join('|'),
    [targets],
  )
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(eligibleBatchTargets(targets).map((item) => item.key)),
  )
  const [statuses, setStatuses] = useState<Record<string, BatchGenerationStatus>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [assets, setAssets] = useState<Record<string, GeneratedAsset>>({})
  const [adopted, setAdopted] = useState<Set<string>>(() => new Set())
  const [starting, setStarting] = useState(false)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [adoptingAll, setAdoptingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const activeProjectId = useRef(projectId)

  useEffect(() => {
    activeProjectId.current = projectId
  }, [projectId])

  useEffect(() => {
    if (running) return
    setSelected(new Set(eligible.map((item) => item.key)))
  }, [readySignature, running])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const selectedTargets = targets.filter((item) => selected.has(item.key) && isBatchTargetReady(item))
  const blockedCount = targets.length - eligible.length
  const warningCount = targets.filter((item) => item.warning?.trim()).length
  const estimate = estimateBatchDuration(selectedTargets.length, 2)
  const finishedCount = selectedTargets.filter((item) => {
    const status = statuses[item.key]
    return status === 'succeeded' || status === 'failed' || status === 'canceled'
  }).length
  const successTargets = selectedTargets.filter((item) => statuses[item.key] === 'succeeded')
  const progressPercent = selectedTargets.length > 0
    ? Math.round((finishedCount / selectedTargets.length) * 100)
    : 0

  function toggleTarget(key: string) {
    if (running) return
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function notifyTarget(item: BatchGenerationTarget) {
    window.dispatchEvent(new CustomEvent('chengju:generation-updated', {
      detail: { targetType: item.targetType, targetId: item.targetId },
    }))
  }

  async function projectForBatch(): Promise<string | null> {
    const pid = activeProjectId.current ?? await onEnsureProject()
    if (!pid) {
      setError('项目还没有保存成功，请重试')
      return null
    }
    activeProjectId.current = pid
    return pid
  }

  async function execute(items: BatchGenerationTarget[]) {
    if (items.length === 0 || running || starting) return
    setStarting(true)
    setError(null)
    setNotice(null)
    setBusyKey(null)
    setStopping(false)
    let pid: string | null = null
    try {
      pid = await projectForBatch()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '项目保存失败，请重试')
    }
    if (!pid) {
      setStarting(false)
      return
    }
    const keys = new Set(items.map((item) => item.key))
    setStatuses((current) => {
      const next = { ...current }
      for (const key of keys) next[key] = 'waiting'
      return next
    })
    setErrors((current) => {
      const next = { ...current }
      for (const key of keys) delete next[key]
      return next
    })
    setAssets((current) => {
      const next = { ...current }
      for (const key of keys) delete next[key]
      return next
    })
    setAdopted((current) => {
      const next = new Set(current)
      for (const key of keys) next.delete(key)
      return next
    })

    const controller = new AbortController()
    controllerRef.current = controller
    setStarting(false)
    setRunning(true)
    try {
      const outcomes = await runBatchGeneration(items, {
        concurrency: 2,
        signal: controller.signal,
        run: async (item, signal) => {
          const result = await generateKeyframe({
            projectId: pid,
            targetType: item.targetType,
            targetId: item.targetId,
            prompt: item.prompt.trim(),
            aspect: item.aspect,
            look,
            autoSelect: false,
          }, signal)
          notifyTarget(item)
          return result.asset
        },
        onProgress: (item, status, detail) => {
          setStatuses((current) => ({ ...current, [item.key]: status }))
          if (detail?.asset) {
            setAssets((current) => ({ ...current, [item.key]: detail.asset! }))
          }
          if (detail?.error) {
            setErrors((current) => ({ ...current, [item.key]: detail.error! }))
          }
        },
      })
      const succeeded = outcomes.filter((item) => item.status === 'succeeded').length
      const failed = outcomes.filter((item) => item.status === 'failed').length
      const canceled = outcomes.filter((item) => item.status === 'canceled').length
      setNotice(
        canceled > 0
          ? `已停止等待。已完成 ${succeeded} 项，另有 ${canceled} 项停止排队；已提交任务可能仍会完成。`
          : `本批完成 ${succeeded} 项${failed > 0 ? `，${failed} 项失败可单独重试` : ''}。结果只保存为候选。`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量生成失败，请重试')
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setRunning(false)
      setStopping(false)
    }
  }

  function handleStop() {
    if (!running || stopping) return
    setStopping(true)
    controllerRef.current?.abort()
  }

  async function adoptCandidate(item: BatchGenerationTarget) {
    const candidate = assets[item.key]
    const pid = activeProjectId.current ?? projectId
    if (!candidate || !pid || busyKey) return
    setBusyKey(item.key)
    setError(null)
    try {
      await selectKeyframe(pid, candidate.id)
      setAdopted((current) => new Set(current).add(item.key))
      setNotice(`已采用「${item.name}」的新版本`)
      notifyTarget(item)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '采用失败，请重试')
    } finally {
      setBusyKey(null)
    }
  }

  async function adoptAll() {
    const pid = activeProjectId.current ?? projectId
    const pending = successTargets.filter((item) => !adopted.has(item.key) && assets[item.key])
    if (!pid || pending.length === 0 || adoptingAll) return
    setAdoptingAll(true)
    setError(null)
    try {
      for (const item of pending) {
        await selectKeyframe(pid, assets[item.key].id)
        setAdopted((current) => new Set(current).add(item.key))
        notifyTarget(item)
      }
      setNotice(`已采用 ${pending.length} 张候选图`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量采用失败，请重试')
    } finally {
      setAdoptingAll(false)
    }
  }

  if (targets.length === 0) return null

  return (
    <section className="batch-generation min-w-0" aria-label={title}>
      <div className="batch-generation-head">
        <div className="batch-generation-heading">
          <span className="batch-generation-mark" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]">
              <rect x="3" y="3" width="10" height="10" rx="1.5" />
              <path d="M7 7h10v10H7z" />
              <path d="M10 10h4v4h-4z" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
              <span className="font-mono text-[10.5px] text-ink-400">{eligible.length} 项可生成</span>
              {blockedCount > 0 && (
                <span className="text-[10.5px] text-accent-700">{blockedCount} 项待补齐</span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{description}</p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          disabled={running}
          className="batch-generation-toggle"
        >
          {open ? '收起选择' : '选择生图项目'}
        </button>
      </div>

      <div className="batch-generation-policy" aria-label="批量生成规则">
        <span>低并发 2</span>
        <span>每项独立任务</span>
        <span>不会自动采用</span>
        <span>本地参考图不上传</span>
      </div>

      {warningCount > 0 && (
        <p className="batch-generation-warning">
          {warningCount} 项缺少可用参考，仍可生成，但一致性可能漂移。
        </p>
      )}

      <SmoothCollapse open={open} id={listId}>
        <div className="batch-generation-selector">
          <div className="batch-generation-selector-head">
            <span>当前范围 · {targets.length} 项</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(eligible.map((item) => item.key)))}
                disabled={running}
              >
                全选可生成
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={running}
              >
                清空
              </button>
            </span>
          </div>

          <div className="batch-generation-list">
            {targets.map((item) => {
              const ready = isBatchTargetReady(item)
              const status = statuses[item.key]
              const checked = selected.has(item.key)
              const candidate = assets[item.key]
              return (
                <div
                  key={item.key}
                  className={`batch-generation-row ${checked ? 'is-selected' : ''} ${!ready ? 'is-blocked' : ''}`}
                >
                  <label className="batch-generation-target">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!ready || running}
                      onChange={() => toggleTarget(item.key)}
                    />
                    <span className="min-w-0">
                      <span className="batch-generation-name">{item.name}</span>
                      <span className="batch-generation-detail">{item.detail}</span>
                    </span>
                  </label>

                  <div className="batch-generation-state">
                    {!ready ? (
                      <span className="is-blocked">{item.blockedReason || '缺提示词'}</span>
                    ) : status ? (
                      <span className={`is-${status}`}>{STATUS_LABEL[status]}</span>
                    ) : item.warning ? (
                      <span className="is-warning">{item.warning}</span>
                    ) : (
                      <span>可生成</span>
                    )}
                    {status === 'succeeded' && candidate && (
                      <button
                        type="button"
                        onClick={() => void adoptCandidate(item)}
                        disabled={Boolean(busyKey) || adopted.has(item.key)}
                      >
                        {adopted.has(item.key) ? '已采用' : '采用'}
                      </button>
                    )}
                    {status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => void execute([item])}
                        disabled={running}
                      >
                        重试
                      </button>
                    )}
                  </div>

                  {errors[item.key] && (
                    <p role="alert" className="batch-generation-error">{errors[item.key]}</p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="batch-generation-footer">
            <div className="min-w-0">
              <p>
                已选 <b>{selectedTargets.length}</b> 项 · {estimate.label}
              </p>
              <p>先保存候选，再由你逐张决定是否采用。</p>
            </div>
            {running ? (
              <button type="button" className="batch-generation-run is-stop" onClick={handleStop} disabled={stopping}>
                {stopping ? '停止中…' : '停止排队'}
              </button>
            ) : (
              <button
                type="button"
                className="batch-generation-run"
                onClick={() => void execute(selectedTargets)}
                disabled={selectedTargets.length === 0 || starting}
              >
                {starting ? '准备项目…' : `开始生成 ${selectedTargets.length} 项`}
              </button>
            )}
          </div>
        </div>
      </SmoothCollapse>

      {(running || Object.keys(statuses).length > 0) && (
        <div className="batch-generation-progress" role="status" aria-live="polite">
          <div className="batch-generation-progress-line">
            <span>
              {running
                ? `生成中 · ${finishedCount}/${selectedTargets.length}`
                : `已结束 · ${successTargets.length} 项候选`}
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="batch-generation-track" aria-hidden="true">
            <span style={{ transform: `scaleX(${progressPercent / 100})` }} />
          </div>
          {!running && successTargets.length > 0 && (
            <button
              type="button"
              className="batch-generation-adopt-all"
              onClick={() => void adoptAll()}
              disabled={adoptingAll || successTargets.every((item) => adopted.has(item.key))}
            >
              {adoptingAll
                ? '正在采用…'
                : successTargets.every((item) => adopted.has(item.key))
                  ? '已采用全部成功项'
                  : `采用全部 ${successTargets.filter((item) => !adopted.has(item.key)).length} 项`}
            </button>
          )}
        </div>
      )}

      {notice && (
        <p className="batch-generation-notice" role="status">{notice}</p>
      )}
      {error && (
        <p className="batch-generation-error-global" role="alert">{error}</p>
      )}
    </section>
  )
}
