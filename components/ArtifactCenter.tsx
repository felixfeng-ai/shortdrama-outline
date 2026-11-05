"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { AgentCard } from "@/lib/agent/tools"
import {
  ARTIFACT_KIND_META,
  describeAgentCard,
  diffArtifactPayloads,
  summarizeArtifactSnapshots,
} from "@/lib/artifact-center"
import type { SnapshotDto } from "@/lib/assets/api"
import type { ArtifactKind } from "@/lib/assets/types"
import SmoothCollapse from "./SmoothCollapse"

interface Props {
  open: boolean
  onClose: () => void
  projectId: string | null
  snapshots: Partial<Record<ArtifactKind, SnapshotDto<unknown>[]>>
  pendingCards: AgentCard[]
  loading?: boolean
  error?: string | null
  onRefresh?: () => void
  onOpenAgent: () => void
}

type CenterTab = "versions" | "queue"

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return "尚无版本"
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPath(path: string): string {
  return path
    .replace(/^\$\./, "")
    .replace(/\$/g, "当前值")
    .replace(/\[([^\]]+)\]/g, " · $1")
}

export default function ArtifactCenter({
  open,
  onClose,
  projectId,
  snapshots,
  pendingCards,
  loading = false,
  error = null,
  onRefresh,
  onOpenAgent,
}: Props) {
  const [tab, setTab] = useState<CenterTab>("versions")
  const [activeKind, setActiveKind] = useState<ArtifactKind>("idea")
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  const activeSnapshots = snapshots[activeKind] ?? []
  const summary = useMemo(
    () => summarizeArtifactSnapshots(activeSnapshots),
    [activeSnapshots],
  )
  const selectedIndex = Math.max(
    0,
    summary.history.findIndex((item) => item.id === selectedSnapshotId),
  )
  const selected = summary.history[selectedIndex] ?? null
  const previous = summary.history[selectedIndex + 1] ?? null
  const changes = useMemo(
    () => diffArtifactPayloads(previous?.payload, selected?.payload),
    [previous?.payload, selected?.payload],
  )

  useEffect(() => {
    if (summary.latest && selectedSnapshotId !== null
      && summary.history.some((item) => item.id === selectedSnapshotId)) return
    setSelectedSnapshotId(summary.latest?.id ?? null)
  }, [selectedSnapshotId, summary.history, summary.latest])

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const timer = window.setTimeout(() => closeRef.current?.focus(), 30)

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab" || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), [tabindex='0']",
      )].filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKey)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKey)
      previousFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="artifact-center-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="artifact-center-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="artifact-center-title"
      >
        <header className="artifact-center-head">
          <div>
            <span>PROJECT ARTIFACTS</span>
            <h2 id="artifact-center-title">产物中心</h2>
            <p>查看项目真实版本，或处理 Agent 尚未确认的提案。</p>
          </div>
          <div className="artifact-center-head-actions">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading || !projectId}
                className="artifact-center-refresh"
              >
                {loading ? "读取中…" : "刷新"}
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="关闭产物中心"
              className="artifact-center-close"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
        </header>

        <div className="artifact-center-tabs" role="tablist" aria-label="产物中心视图">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "versions"}
            className="artifact-center-tab"
            onClick={() => setTab("versions")}
          >
            产物版本
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "queue"}
            className="artifact-center-tab"
            onClick={() => setTab("queue")}
          >
            确认队列
            {pendingCards.length > 0 && <b>{pendingCards.length}</b>}
          </button>
        </div>

        {!projectId ? (
          <div className="artifact-center-empty">
            <strong>还没有项目产物</strong>
            <p>先在工作台生成并保存一个项目，版本会在这里按类型汇总。</p>
          </div>
        ) : tab === "versions" ? (
          <div className="artifact-center-grid">
            <nav className="artifact-kind-list" aria-label="产物类型">
              {ARTIFACT_KIND_META.map((meta) => {
                const itemSummary = summarizeArtifactSnapshots(snapshots[meta.kind] ?? [])
                return (
                  <button
                    key={meta.kind}
                    type="button"
                    className="artifact-kind-row"
                    aria-current={activeKind === meta.kind ? "true" : undefined}
                    onClick={() => {
                      setActiveKind(meta.kind)
                      setSelectedSnapshotId(null)
                    }}
                  >
                    <span>
                      <b>{meta.label}</b>
                      <small>{meta.description}</small>
                    </span>
                    <em>
                      {itemSummary.version ? `v${itemSummary.version}` : "未生成"}
                      {itemSummary.latest && <i>{itemSummary.itemCount} 项</i>}
                    </em>
                  </button>
                )
              })}
            </nav>

            <div className="artifact-version-panel">
              <div className="artifact-version-summary">
                <div>
                  <span>当前产物</span>
                  <strong>{ARTIFACT_KIND_META.find((item) => item.kind === activeKind)?.label}</strong>
                </div>
                <dl>
                  <div>
                    <dt>最新版本</dt>
                    <dd>{summary.version ? `v${summary.version}` : "—"}</dd>
                  </div>
                  <div>
                    <dt>条目</dt>
                    <dd>{summary.itemCount}</dd>
                  </div>
                  <div>
                    <dt>更新</dt>
                    <dd>{formatTimestamp(summary.updatedAt)}</dd>
                  </div>
                </dl>
              </div>

              {error && <p className="artifact-center-error" role="alert">{error}</p>}

              {summary.history.length === 0 ? (
                <div className="artifact-center-empty compact">
                  <strong>这一类还没有版本</strong>
                  <p>完成对应创作步骤并保存后，这里会出现第一条真实快照。</p>
                </div>
              ) : (
                <div className="artifact-version-workspace">
                  <ol className="artifact-history-list" aria-label="历史版本">
                    {summary.history.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={selected?.id === item.id ? "true" : undefined}
                          onClick={() => setSelectedSnapshotId(item.id)}
                        >
                          <span className="artifact-history-version">v{item.version}</span>
                          <span className="artifact-history-copy">
                            <b>{formatTimestamp(item.createdAt)}</b>
                            <small>{summarizeArtifactSnapshots([item]).itemCount} 项 · {item.id.slice(0, 8)}</small>
                          </span>
                          <span className="artifact-history-mark" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ol>

                  <div className="artifact-diff-panel">
                    {selected ? (
                      <>
                        <div className="artifact-diff-head">
                          <div>
                            <span>版本对比</span>
                            <strong>
                              {previous ? `v${previous.version} → v${selected.version}` : `v${selected.version} · 初始版本`}
                            </strong>
                          </div>
                          <em>{previous ? `${changes.length} 处变化` : "没有更早版本"}</em>
                        </div>
                        <SmoothCollapse open>
                          <div className="artifact-diff-list">
                            {!previous && (
                              <p className="artifact-diff-empty">
                                这是该类产物的第一条快照，没有可比较的前一版。
                              </p>
                            )}
                            {previous && changes.length === 0 && (
                              <p className="artifact-diff-empty">两版内容没有结构或值变化。</p>
                            )}
                            {changes.map((change, index) => (
                              <article key={`${change.path}-${index}`} className="artifact-diff-row">
                                <header>
                                  <span className={`artifact-diff-kind ${change.kind}`}>
                                    {change.kind === "added" ? "新增" : change.kind === "removed" ? "移除" : "修改"}
                                  </span>
                                  <code>{formatPath(change.path)}</code>
                                </header>
                                <div>
                                  {change.before && <p><span>原值</span>{change.before}</p>}
                                  {change.after && <p><span>现值</span>{change.after}</p>}
                                </div>
                              </article>
                            ))}
                          </div>
                        </SmoothCollapse>
                      </>
                    ) : (
                      <p className="artifact-diff-empty">选择一个版本查看变化。</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="artifact-center-queue">
            <div className="artifact-queue-head">
              <div>
                <span>等待你的判断</span>
                <strong>{pendingCards.length > 0 ? `${pendingCards.length} 项待确认` : "没有待确认项"}</strong>
              </div>
              <p>确认和忽略仍只在 Agent 内发生，这里不会直接写入项目。</p>
            </div>
            {pendingCards.length === 0 ? (
              <div className="artifact-center-empty">
                <strong>当前会话没有待处理提案</strong>
                <p>Agent 生成修改建议后，会在这里同步出现。</p>
              </div>
            ) : (
              <ol className="artifact-queue-list">
                {pendingCards.map((card, index) => {
                  const description = describeAgentCard(card)
                  return (
                    <li key={`${card.kind}-${description.target}-${index}`}>
                      <span className="artifact-queue-type">{description.type}</span>
                      <div>
                        <strong>{description.target}</strong>
                        <p>{description.summary}</p>
                        <small>{description.nextAction}</small>
                      </div>
                      <button type="button" onClick={onOpenAgent}>
                        在 Agent 中处理
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
