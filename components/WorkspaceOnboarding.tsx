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
 * 快速创作用一次预算确认决定做到故事、动态分镜还是单镜头视频。
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

function TargetIcon({ target }: { target: QuickCreationTarget }) {
  if (target === "story") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4.5h8a2.5 2.5 0 0 1 2.5 2.5v12H7.5A2.5 2.5 0 0 1 5 16.5z" />
        <path d="M15.5 7H19v12h-6.5A2.5 2.5 0 0 1 10 16.5V4.5" />
        <path d="M8 8h4M8 11h3" />
      </svg>
    )
  }
  if (target === "video") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m10 9 5 3-5 3z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m5 15 4.5-4.5 3 3L16 10l3 3M8 9h.01" />
    </svg>
  )
}

const TARGETS: QuickCreationTarget[] = ["story", "keyframe", "video"]
const SHOWCASE = [
  {
    label: "雨夜继承人",
    detail: "人物定妆",
    meta: "Canon · 角色锚点",
    frame: "FRAME 01",
    image: "/visuals/premium/estate-rain.webp",
    tone: "cyan",
  },
  {
    label: "门外对峙",
    detail: "动态分镜",
    meta: "Shot 02 · 连续运镜",
    frame: "FRAME 02",
    image: "/visuals/premium/umbrella-heir.webp",
    tone: "gold",
  },
  {
    label: "伪造的遗嘱",
    detail: "镜头与成片",
    meta: "Take 03 · 情绪特写",
    frame: "FRAME 03",
    image: "/visuals/premium/night-letter.webp",
    tone: "coral",
  },
] as const

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
  const [target, setTarget] = useState<QuickCreationTarget>("keyframe")
  const fallbackQuotes = useMemo(() => buildQuickCreationQuotes(), [])
  const [quotes, setQuotes] = useState<QuickCreationQuotes>(fallbackQuotes)
  const [quotesLoading, setQuotesLoading] = useState(true)
  const quote = quotes[target]
  const estimatedMinutes = Math.max(1, Math.round(quote.estimatedSeconds / 60))
  const startLabel =
    target === "story"
      ? "先生成故事样片"
      : target === "keyframe"
        ? "生成动态分镜"
        : `生成 ${quote.video?.durationSeconds ?? 5} 秒视频样片`
  const outcomeLines =
    target === "story"
      ? [
          ["故事骨架", "核心人物、三幕冲突和第一集钩子"],
          ["可判断文本", "人物关系与开篇节奏先成立"],
        ]
      : target === "keyframe"
        ? [
            ["故事骨架", "人物、三幕和第一集先落库"],
            ["视觉定妆", "角色、场次和分镜自动准备"],
            ["动态分镜", "前 5 镜首帧自动生成并采用"],
          ]
        : [
            ["故事骨架", "人物、三幕和第一集先落库"],
            ["视觉定妆", "角色、场次和分镜自动准备"],
            ["动态分镜与视频", "5 张首帧后追加第一条镜头视频"],
          ]
  const outcomeImage =
    target === "story"
      ? "/visuals/premium/night-letter.webp"
      : target === "keyframe"
        ? "/visuals/premium/green-corridor.webp"
        : "/visuals/premium/umbrella-heir.webp"

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
        <div className="wfx-onboarding-head-copy">
          <span className="wfx-onboarding-eyebrow">
            <i aria-hidden="true" />
            AI SHORT DRAMA PRODUCTION
          </span>
          <h1 aria-label="一句成戏，先看一场">
            <span className="is-gold">一句成戏</span>
            <span className="is-punctuation" aria-hidden="true">，</span>
            <span className="is-white">先看一场</span>
          </h1>
          <p>
            从 <span className="is-gold">故事</span> 到 <span className="is-blue">镜头</span>，
            人物、分镜与首帧自动完成，满意后再做完整短剧。
          </p>
        </div>
        <div className="wfx-onboarding-showcase" aria-label="从故事到成片的真实工作区预览">
          {SHOWCASE.map((item) => (
            <figure key={item.label} className={`is-${item.tone}`}>
              <img src={item.image} alt="" />
              <span className="wfx-onboarding-frame-index">{item.frame}</span>
              <figcaption>
                <span>{item.detail}</span>
                <b>{item.label}</b>
                <small>{item.meta}</small>
              </figcaption>
            </figure>
          ))}
        </div>
      </header>

      <section className="wfx-onboarding-primary" aria-labelledby="onboarding-launch-title">
        <div className="wfx-onboarding-composer">
          <header>
            <h2 id="onboarding-launch-title">写一句故事</h2>
          </header>

          <label className="wfx-onboarding-field">
            <span>故事想法</span>
            <textarea
              value={idea}
              maxLength={240}
              placeholder="被家族抛弃的继承人，在婚礼当天发现死亡证明被伪造。"
              onChange={(event) => {
                setIdea(event.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault()
                  void handleQuickTrial()
                }
              }}
              disabled={busy !== null}
            />
          </label>
          <div className="wfx-onboarding-field-meta">
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
                  data-target={key}
                  disabled={busy !== null || !option.available}
                  title={option.description}
                  onClick={() => setTarget(key)}
                >
                  <span className="wfx-onboarding-target-icon" aria-hidden="true">
                    <TargetIcon target={key} />
                  </span>
                  <b>{option.label}</b>
                  <small>
                    {option.available
                      ? `${option.units} 额度 · ${formatBudget(option.totalMicros)}`
                      : option.unavailableReason}
                  </small>
                </button>
              )
            })}
          </div>

          <div className="wfx-onboarding-actions">
            <button
              className="wfx-button wfx-onboarding-primary-action"
              type="button"
              aria-label="开始快速创作"
              disabled={busy !== null || quotesLoading || !quote.available}
              onClick={() => { void handleQuickTrial() }}
            >
              <span>
                <b>{busy === "quick" ? "正在建立创作任务…" : startLabel}</b>
                <small>
                  预计 {estimatedMinutes} 分钟 · {quote.units} 额度 · {formatBudget(quote.totalMicros)}
                </small>
              </span>
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
            本次只授权所选范围，超出不扣费。
          </p>
        </div>

        <aside className="wfx-onboarding-outcome" aria-labelledby="onboarding-outcome-title">
          <span>自动完成</span>
          <h2 id="onboarding-outcome-title">{quote.label}</h2>
          <figure className={`wfx-onboarding-outcome-media is-${target}`}>
            <img src={outcomeImage} alt={quote.label} />
            <span className="wfx-onboarding-outcome-shot">
              {target === "video" ? "SHOT 01 / TAKE 03" : target === "keyframe" ? "SCENE 04 / FRAME 12" : "STORY / EPISODE 01"}
            </span>
            <figcaption>{target === "video" ? "首帧 + 镜头视频" : target === "keyframe" ? "前 5 镜动态分镜" : "人物、三幕与第一集"}</figcaption>
          </figure>
          <ol>
            {outcomeLines.map(([label, detail], index) => (
              <li key={label} className={`is-step-${index + 1}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><b>{label}</b><small>{detail}</small></div>
              </li>
            ))}
          </ol>
          <div className="wfx-onboarding-outcome-note">
            结果写入当前项目，可继续精修。
          </div>
        </aside>
      </section>

      <section className="wfx-onboarding-support" aria-label="更多创作起点">
        <details>
          <summary>
            <span>更多起点</span>
            <b>小说、剧本或示例</b>
          </summary>
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
        </details>

        <details>
          <summary>
            <span>创作方式</span>
            <b>完整六步</b>
          </summary>
          <ol className="wfx-onboarding-steps">
            {ONBOARDING_STEPS.map((step, index) => (
              <li key={step.key}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><b>{step.label}</b><small>{step.output}</small></div>
              </li>
            ))}
          </ol>
        </details>

        <a className="wfx-onboarding-docs" href="/docs#quick-start">查看使用教程</a>
      </section>
    </div>
  )
}
