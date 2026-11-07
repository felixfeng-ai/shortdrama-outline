"use client"

/**
 * 快速试片运行条只表达真实完成阶段。
 * ready 和 error 是终止态：前者允许查看第一集，后者保留已完成内容并说明失败。
 */
export type QuickTrialPhase = "characters" | "acts" | "episodes" | "ready"

interface Props {
  phase: QuickTrialPhase
  error: string | null
  onOpenEpisodes: () => void
  onDismiss: () => void
}

const STEPS: Array<{ phase: Exclude<QuickTrialPhase, "ready">; label: string }> = [
  { phase: "characters", label: "核心人物" },
  { phase: "acts", label: "三幕大纲" },
  { phase: "episodes", label: "第一集" },
]

function phaseIndex(phase: QuickTrialPhase): number {
  // ready 视为三步全部完成，避免最后一个阶段一直显示为进行中。
  if (phase === "ready") return STEPS.length
  return STEPS.findIndex((step) => step.phase === phase)
}

export default function QuickTrialProgress({
  phase,
  error,
  onOpenEpisodes,
  onDismiss,
}: Props) {
  const activeIndex = phaseIndex(phase)
  const ready = phase === "ready"
  const title = error
    ? "快速试片停在当前阶段"
    : ready
      ? "第一集故事骨架已生成"
      : `正在生成${STEPS[activeIndex]?.label ?? "样片"}`
  const description = error
    ?? (ready
      ? "已完成核心人物、三幕大纲和第一集。定妆、首帧和视频仍需你确认后生成。"
      : "页面会按顺序继续生成；切换当前步骤不会打断这次快速试片。")

  return (
    <section className="wfx-quick-trial-progress" aria-live="polite">
      <div className="wfx-quick-trial-copy">
        <span>快速试片</span>
        <b>{title}</b>
        <p className={error ? "is-error" : ""}>{description}</p>
      </div>

      <ol className="wfx-quick-trial-steps" aria-label="快速试片进度">
        {STEPS.map((step, index) => {
          const done = ready || index < activeIndex
          const current = !ready && index === activeIndex
          return (
            <li
              key={step.phase}
              className={`${done ? "is-done" : ""} ${current ? "is-current" : ""} ${current && error ? "is-error" : ""}`}
            >
              <i />
              <span>{step.label}</span>
            </li>
          )
        })}
      </ol>

      <div className="wfx-quick-trial-actions">
        {ready && (
          <button className="wfx-button" type="button" onClick={onOpenEpisodes}>
            查看第一集
          </button>
        )}
        {(ready || error) && (
          <button className="wfx-button is-secondary" type="button" onClick={onDismiss}>
            关闭
          </button>
        )}
      </div>
    </section>
  )
}
