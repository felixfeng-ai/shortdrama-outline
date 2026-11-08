"use client"

import { useEffect, useMemo, useState } from "react"

import {
  buildQuickCreationQuotes,
  type QuickCreationQuotes,
  type QuickCreationTarget,
} from "@/lib/production/quick-trial"
import { fetchQuickCreationQuotes } from "@/lib/production/quick-trial-client"
import { MIN_IDEA_LENGTH } from "@/lib/types"
import { ONBOARDING_STEPS } from "@/lib/workspace-onboarding"

/**
 * 首次入口只负责收集真实起点并明确付费意图。
 * 快速创作用一次预算确认决定做到故事、首帧还是单镜头视频。
 */
interface Props {
  onStartQuickTrial: (idea: string, target: QuickCreationTarget) => Promise<void>
  onStartGuided: (idea: string) => void
  onOpenSource: () => void
  onLoadSample: () => void
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>
}

function SourceIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.5h7l3 3v10H5z" /><path d="M12 3.5v3h3M7.5 9h5M7.5 12h5" /></svg>
}

function SampleIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="m8 7 5 3-5 3V7Z" /></svg>
}

const TARGETS: QuickCreationTarget[] = ["story", "keyframe", "video"]

function formatBudget(micros: number): string {
  return `¥${(micros / 1_000_000).toFixed(2)}`
}

export default function WorkspaceOnboarding({
  onStartQuickTrial,
  onStartGuided,
  onOpenSource,
  onLoadSample,
}: Props) {
  const [idea, setIdea] = useState("")
  const [busy, setBusy] = useState<"quick" | "guided" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<QuickCreationTarget>("story")
  const fallbackQuotes = useMemo(() => buildQuickCreationQuotes(), [])
  const [quotes, setQuotes] = useState<QuickCreationQuotes>(fallbackQuotes)
  const [quotesLoading, setQuotesLoading] = useState(true)
  const quote = quotes[target]

  useEffect(() => {
    let cancelled = false
    setQuotesLoading(true)
    fetchQuickCreationQuotes()
      .then((next) => {
        if (!cancelled) setQuotes(next)
      })
      .catch(() => {
        // 读取失败时仍允许故事和首帧范围，视频范围保持关闭。
      })
      .finally(() => {
        if (!cancelled) setQuotesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function readIdea(): string | null {
    const value = idea.trim()
    if (value.length < MIN_IDEA_LENGTH) {
      setError(`请至少写 ${MIN_IDEA_LENGTH} 个字，让系统能判断人物和冲突。`)
      return null
    }
    setError(null)
    return value
  }

  async function handleQuickTrial() {
    const value = readIdea()
    if (!value || busy) return
    setBusy("quick")
    try {
      // 页面负责实际生成；组件只在失败时保留错误，不伪造成功进度。
      await onStartQuickTrial(value, target)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "样片启动失败，请重试。")
    } finally {
      setBusy(null)
    }
  }

  function handleGuidedStart() {
    const value = readIdea()
    if (!value || busy) return
    setBusy("guided")
    try {
      // 分步制作保持零副作用，生产计划由用户后续明确确认。
      onStartGuided(value)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="wfx-onboarding">
      <header className="wfx-onboarding-head">
        <div>
          <span>从第一次判断开始</span>
          <h1>一句话开始，自己决定做到哪里</h1>
          <p>
            先写一句真实故事想法。快速创作只保留一个入口，先选这次要得到的产物，再确认一次预算。
          </p>
        </div>
        <a className="wfx-button is-secondary" href="/docs#quick-start">
          查看完整教程
        </a>
      </header>

      <section className="wfx-onboarding-launch" aria-labelledby="onboarding-launch-title">
        <div className="wfx-onboarding-composer">
          <header>
            <span>一句话故事</span>
            <h2 id="onboarding-launch-title">这次先验证什么？</h2>
            <p>写清主角、意外和最重要的一次冲突，再选择这次做到哪一步。</p>
          </header>

          <label className="wfx-onboarding-field">
            <span>故事想法</span>
            <textarea
              value={idea}
              maxLength={240}
              placeholder="例如：一个被家族抛弃的继承人，在婚礼当天发现自己的死亡证明被人伪造了。"
              onChange={(event) => {
                setIdea(event.target.value)
                if (error) setError(null)
              }}
              disabled={busy !== null}
            />
          </label>
          <div className="wfx-onboarding-field-meta">
            <span>不需要先理解六步，也不用现在选整季集数。</span>
            <span>{idea.length} / 240</span>
          </div>

          {error && <p className="wfx-onboarding-error" role="alert">{error}</p>}

          <div className="wfx-onboarding-targets" role="radiogroup" aria-label="快速创作范围">
            {TARGETS.map((key) => {
              const option = quotes[key]
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={target === key}
                  className={target === key ? "is-active" : ""}
                  disabled={busy !== null || !option.available}
                  onClick={() => setTarget(key)}
                >
                  <b>{option.label}</b>
                  <small>{option.description}</small>
                  <span>
                    {option.available
                      ? `${option.units} 额度 · ${formatBudget(option.totalMicros)}`
                      : option.unavailableReason}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="wfx-onboarding-facts" aria-label="快速创作预算">
            <span><b>{quote.steps.join(" → ")}</b>本次只执行到所选终止点</span>
            <span><b>{quote.units} 创作额度</b>{quotesLoading ? "正在核对服务端预算" : "开始前一次确认"}</span>
            <span>
              <b>总预算 {formatBudget(quote.totalMicros)}</b>
              {quote.videoCostMicros > 0 ? `其中视频 ${formatBudget(quote.videoCostMicros)}` : "不含视频费用"}
            </span>
          </div>

          <div className="wfx-onboarding-actions">
            <button
              className="wfx-button"
              type="button"
              disabled={busy !== null || quotesLoading || !quote.available}
              onClick={() => { void handleQuickTrial() }}
            >
              {busy === "quick" ? "正在建立创作任务…" : "开始快速创作"}
              {busy !== "quick" && <ArrowIcon />}
            </button>
            <button
              className="wfx-button is-secondary"
              type="button"
              disabled={busy !== null}
              onClick={handleGuidedStart}
            >
              分步制作
            </button>
          </div>
          <p className="wfx-onboarding-note">
            本次确认覆盖所选范围与预算；超出范围、预算或供应商价格变化时不会继续扣费。
          </p>
        </div>

        <aside className="wfx-onboarding-preview" aria-labelledby="onboarding-preview-title">
          <header>
            <span>{quote.label}</span>
            <h2 id="onboarding-preview-title">{quote.description}</h2>
            <p>不是另一套 Demo。人物、分集、镜头、视频和版本都会留在当前项目里。</p>
          </header>

          <ol className="wfx-onboarding-phases">
            {quote.steps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><b>{step}</b><small>完成后写入同一个项目版本</small></div>
              </li>
            ))}
          </ol>

          <details className="wfx-onboarding-details">
            <summary>查看完整六步与真实产出</summary>
            <ol>
              {ONBOARDING_STEPS.map((step, index) => (
                <li key={step.key}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><b>{step.label}</b><small>{step.output}</small></div>
                </li>
              ))}
            </ol>
          </details>
        </aside>
      </section>

      <section className="wfx-onboarding-sources" aria-labelledby="onboarding-source-title">
        <header>
          <span>已有内容或想先看看</span>
          <h2 id="onboarding-source-title">也可以从这些起点进入</h2>
        </header>
        <div className="wfx-onboarding-source-grid">
          <button className="wfx-onboarding-entry" type="button" onClick={onOpenSource}>
            <span className="wfx-onboarding-entry-icon"><SourceIcon /></span>
            <span className="wfx-onboarding-entry-copy">
              <b>导入小说或剧本</b>
              <small>保留原文，再整理人物关系、改编计划和短剧结构。</small>
            </span>
            <ArrowIcon />
          </button>

          <button className="wfx-onboarding-entry" type="button" onClick={onLoadSample}>
            <span className="wfx-onboarding-entry-icon"><SampleIcon /></span>
            <span className="wfx-onboarding-entry-copy">
              <b>查看示例项目</b>
              <small>用一部 3 集示例直接查看人物、分镜、视频与成片。</small>
            </span>
            <ArrowIcon />
          </button>
        </div>
      </section>
    </div>
  )
}
