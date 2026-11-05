"use client"

import { useEffect, useState } from "react"

import type { AgentActionRunDto } from "@/lib/agent/runs"
import SmoothCollapse from "./SmoothCollapse"

interface Props {
  runs: AgentActionRunDto[]
  loading: boolean
  error: string | null
  rollingBackId: string | null
  onRefresh: () => void
  onRollback: (runId: string) => Promise<void>
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function actionLabel(run: AgentActionRunDto): string {
  return run.actionKind === "shot-edit" ? "镜头改写" : "实体修改"
}

export default function AgentRunPanel({
  runs,
  loading,
  error,
  rollingBackId,
  onRefresh,
  onRollback,
}: Props) {
  const [open, setOpen] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const rollbackable = runs.filter((run) => run.status === "applied").length

  useEffect(() => {
    if (confirmingId && !runs.some((run) => run.id === confirmingId && run.status === "applied")) {
      setConfirmingId(null)
    }
  }, [confirmingId, runs])

  return (
    <section className="agent-run-panel" aria-label="Agent 执行记录">
      <button
        type="button"
        className="agent-run-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <b>执行记录</b>
          <small>
            {runs.length > 0
              ? `${runs.length} 次执行${rollbackable > 0 ? ` · ${rollbackable} 次可回滚` : " · 已全部处理"}`
              : "还没有可回滚修改"}
          </small>
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className={open ? "is-open" : ""}>
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      <SmoothCollapse open={open}>
        <div className="agent-run-content">
          <div className="agent-run-head">
            <span>真实快照与回滚状态</span>
            <button type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "读取中…" : "刷新"}
            </button>
          </div>

          {error && <p className="agent-run-error" role="alert">{error}</p>}
          {!error && runs.length === 0 && (
            <p className="agent-run-empty">
              确认一条镜头或实体修改后，这里会保留执行记录和回滚入口。
            </p>
          )}

          {runs.length > 0 && (
            <ol className="agent-run-list">
              {runs.map((run) => (
                <li key={run.id} className={`agent-run-row ${run.status}`}>
                  <div className="agent-run-copy">
                    <span className="agent-run-kind">{actionLabel(run)}</span>
                    <strong>{run.summary}</strong>
                    <p>{run.targetLabel} · {run.field}</p>
                    <small>
                      {formatTime(run.createdAt)}
                      <i>快照 {run.beforeSnapshotId.slice(0, 8)} → {run.afterSnapshotId.slice(0, 8)}</i>
                    </small>
                  </div>
                  <div className="agent-run-actions">
                    {run.status === "rolled_back" ? (
                      <span className="agent-run-status">已回滚</span>
                    ) : confirmingId === run.id ? (
                      <>
                        <button
                          type="button"
                          className="danger"
                          disabled={rollingBackId === run.id}
                          onClick={() => { void onRollback(run.id) }}
                        >
                          {rollingBackId === run.id ? "回滚中…" : "确认回滚"}
                        </button>
                        <button
                          type="button"
                          disabled={rollingBackId === run.id}
                          onClick={() => setConfirmingId(null)}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmingId(run.id)}>
                        回滚
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SmoothCollapse>
    </section>
  )
}
