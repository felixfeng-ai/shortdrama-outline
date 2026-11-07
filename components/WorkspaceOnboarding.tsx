"use client"

import { ONBOARDING_STEPS } from "@/lib/workspace-onboarding"

interface Props {
  onCreateIdea: () => void
  onOpenSource: () => void
  onLoadSample: () => void
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>
}

function IdeaIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9Z" /><path d="M8 17h4M8 14h4" /></svg>
}

function SourceIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.5h7l3 3v10H5z" /><path d="M12 3.5v3h3M7.5 9h5M7.5 12h5" /></svg>
}

function SampleIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="m8 7 5 3-5 3V7Z" /></svg>
}

export default function WorkspaceOnboarding({
  onCreateIdea,
  onOpenSource,
  onLoadSample,
}: Props) {
  return (
    <div className="wfx-onboarding">
      <header className="wfx-onboarding-head">
        <div>
          <h1>开始第一部短剧</h1>
          <p>先选一个起点。系统会从核心人物开始，逐步带你完成六步，不需要提前理解全部流程。</p>
        </div>
        <a className="wfx-button is-secondary" href="/docs#quick-start">
          查看完整教程
        </a>
      </header>

      <div className="wfx-onboarding-layout">
        <section className="wfx-onboarding-entries" aria-labelledby="onboarding-start-title">
          <header>
            <span>选择起点</span>
            <h2 id="onboarding-start-title">你准备从哪里开始？</h2>
          </header>

          <button className="wfx-onboarding-entry is-primary" type="button" onClick={onCreateIdea}>
            <span className="wfx-onboarding-entry-icon"><IdeaIcon /></span>
            <span className="wfx-onboarding-entry-copy">
              <b>从一句想法开始</b>
              <small>写一句故事想法，先生成核心人物和三幕大纲。</small>
            </span>
            <ArrowIcon />
          </button>

          <button className="wfx-onboarding-entry" type="button" onClick={onOpenSource}>
            <span className="wfx-onboarding-entry-icon"><SourceIcon /></span>
            <span className="wfx-onboarding-entry-copy">
              <b>导入小说或剧本</b>
              <small>保存原文后，再整理人物关系和改编计划。</small>
            </span>
            <ArrowIcon />
          </button>

          <button className="wfx-onboarding-entry" type="button" onClick={onLoadSample}>
            <span className="wfx-onboarding-entry-icon"><SampleIcon /></span>
            <span className="wfx-onboarding-entry-copy">
              <b>先看示例项目</b>
              <small>用一部 3 集示例快速了解完整制作流程。</small>
            </span>
            <ArrowIcon />
          </button>

          <p className="wfx-onboarding-note">
            选择后仍可切换起点。原文、生成结果和项目版本都会保存在当前项目里。
          </p>
        </section>

        <section className="wfx-onboarding-path" aria-labelledby="onboarding-path-title">
          <header>
            <span>完成后会得到什么</span>
            <h2 id="onboarding-path-title">六步制作路径</h2>
          </header>
          <ol>
            {ONBOARDING_STEPS.map((step, index) => (
              <li key={step.key}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <b>{step.label}</b>
                  <small>{step.output}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
