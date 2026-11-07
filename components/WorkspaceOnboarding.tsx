"use client"

import { useState } from "react"

import { projectQuotaUnits } from "@/lib/episodes"
import { MIN_IDEA_LENGTH } from "@/lib/types"
import { ONBOARDING_STEPS } from "@/lib/workspace-onboarding"

interface Props {
  onStartQuickTrial: (idea: string) => Promise<void>
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

export default function WorkspaceOnboarding({
  onStartQuickTrial,
  onStartGuided,
  onOpenSource,
  onLoadSample,
}: Props) {
  const [idea, setIdea] = useState("")
  const [busy, setBusy] = useState<"quick" | "guided" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sampleUnits = projectQuotaUnits(1)

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
      await onStartQuickTrial(value)
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
          <h1>先做一个能判断的样片</h1>
          <p>
            先写一句真实故事想法。快速试片会进入同一套项目生产链，后续可以直接扩成小批或整季，不需要重新搭项目。
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
            <h2 id="onboarding-launch-title">你想让观众先看到什么？</h2>
            <p>写清主角、意外和最重要的一次冲突，系统会从核心人物开始。</p>
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

          <div className="wfx-onboarding-facts" aria-label="快速试片说明">
            <span><b>1 集样片</b>先验证人物、钩子和画面</span>
            <span><b>约 {sampleUnits} 额度</b>按实际步骤结算</span>
            <span><b>同一条生产链</b>可继续扩集</span>
          </div>

          <div className="wfx-onboarding-actions">
            <button
              className="wfx-button"
              type="button"
              disabled={busy !== null}
              onClick={() => { void handleQuickTrial() }}
            >
              {busy === "quick" ? "正在建立样片…" : "开始快速试片"}
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
            快速试片会立即生成核心人物。后续每一步仍由你确认，可随时停下、修改或扩集。
          </p>
        </div>

        <aside className="wfx-onboarding-preview" aria-labelledby="onboarding-preview-title">
          <header>
            <span>快速试片</span>
            <h2 id="onboarding-preview-title">先得到可判断的内容</h2>
            <p>不是另一套 Demo。人物、分集、分镜和版本都会留在当前项目里。</p>
          </header>

          <ol className="wfx-onboarding-phases">
            <li>
              <span>01</span>
              <div><b>人物与故事骨架</b><small>主角动机、核心冲突、三幕方向</small></div>
            </li>
            <li>
              <span>02</span>
              <div><b>第一集与场次</b><small>先检查钩子、节奏和可拍性</small></div>
            </li>
            <li>
              <span>03</span>
              <div><b>定妆、分镜与首帧</b><small>继续进入镜头视频和时间线</small></div>
            </li>
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
