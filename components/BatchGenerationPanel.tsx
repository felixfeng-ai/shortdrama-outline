'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import SmoothCollapse from './SmoothCollapse'
import {
  eligibleBatchTargets,
  estimateBatchDuration,
  isBatchTargetReady,
  type BatchGenerationStatus,
  type BatchGenerationTarget,
} from '@/lib/generation/batch'
import { batchRunStore, EMPTY_BATCH_RUN_STATE } from '@/lib/generation/batch-store'
import type { LookBook } from '@/lib/look'

interface Props {
  scope: string
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
  scope,
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
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [runKeyOverride, setRunKeyOverride] = useState<string | null>(null)
  const activeProjectId = useRef(projectId)
  const batchKey = projectId
    ? `${projectId}:${scope}`
    : runKeyOverride ?? `pending:${scope}`
  const subscribe = useCallback(
    (listener: () => void) => batchRunStore.subscribe(batchKey, listener),
    [batchKey],
  )
  const getSnapshot = useCallback(() => batchRunStore.getSnapshot(batchKey), [batchKey])
  const runState = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_BATCH_RUN_STATE)
  const statuses = runState.statuses
  const errors = runState.errors
  const assets = runState.assets
  const adopted = useMemo(() => new Set(runState.adoptedKeys), [runState.adoptedKeys])
  const running = runState.running
  const stopping = runState.stopping
  const busyKey = runState.busyKey
  const adoptingAll = runState.adoptingAll
  const error = runState.error ?? startError
  const notice = runState.notice
  const runSelectionSignature = runState.selectedKeys.join('|')

  useEffect(() => {
    activeProjectId.current = projectId
  }, [projectId])

  useEffect(() => {
    if (running) return
    const saved = runState.selectedKeys.filter((key) =>
      eligible.some((item) => item.key === key))
    setSelected(new Set(saved.length > 0 ? saved : eligible.map((item) => item.key)))
  }, [readySignature, runSelectionSignature, running])

  useEffect(() => {
    if (running || notice || error) setOpen(true)
  }, [error, notice, running])

  const effectiveSelected = running
    ? new Set(runState.selectedKeys)
    : selected

  const selectedTargets = targets.filter((item) => effectiveSelected.has(item.key) && isBatchTargetReady(item))
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

  async function projectForBatch(): Promise<string | null> {
    const pid = activeProjectId.current ?? await onEnsureProject()
    if (!pid) {
      setStartError('项目还没有保存成功，请重试')
      return null
    }
    activeProjectId.current = pid
    return pid
  }

  async function execute(items: BatchGenerationTarget[]) {
    if (items.length === 0 || running || starting) return
    setStarting(true)
    setStartError(null)
    let pid: string | null = null
    try {
      pid = await projectForBatch()
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : '项目保存失败，请重试')
    }
    if (!pid) {
      setStarting(false)
      return
    }
    const key = `${pid}:${scope}`
    setRunKeyOverride(key)
    setStarting(false)
    await batchRunStore.start(key, { projectId: pid, targets: items, look })
  }

  function handleStop() {
    if (!running || stopping) return
    batchRunStore.stop(batchKey)
  }

  async function adoptCandidate(item: BatchGenerationTarget) {
    const pid = activeProjectId.current ?? projectId
    if (!pid || !assets[item.key] || busyKey) return
    await batchRunStore.adoptCandidate(batchKey, pid, item)
  }

  async function adoptAll() {
    const pid = activeProjectId.current ?? projectId
    const pending = successTargets.filter((item) => !adopted.has(item.key) && assets[item.key])
    if (!pid || pending.length === 0 || adoptingAll) return
    await batchRunStore.adoptAll(batchKey, pid, successTargets)
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
              const checked = effectiveSelected.has(item.key)
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
