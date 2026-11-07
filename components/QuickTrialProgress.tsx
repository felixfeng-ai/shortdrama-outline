"use client"

/**
 * 快速试片运行条只表达真实完成阶段。
 * ready 允许继续生成视觉样片；visual-ready 才代表首帧可用。
 */
export type QuickTrialPhase =
  | "characters"
  | "acts"
  | "episodes"
  | "ready"
  | "visuals"
  | "scenes"
  | "shots"
  | "keyframe"
  | "visual-ready"

interface Props {
  phase: QuickTrialPhase
  error: string | null
  visualUnits: number
  onOpenEpisodes: () => void
  onContinueVisual: () => void
  onOpenFirstFrame: () => void
  onDismiss: () => void
}

const STEPS: Array<{ phase: Exclude<QuickTrialPhase, "ready">; label: string }> = [
  { phase: "characters", label: "核心人物" },
  { phase: "acts", label: "三幕大纲" },
  { phase: "episodes", label: "第一集" },
  { phase: "visuals", label: "定妆" },
  { phase: "scenes", label: "场次" },
  { phase: "shots", label: "分镜" },
  { phase: "keyframe", label: "首帧" },
]

function phaseIndex(phase: QuickTrialPhase): number {
  // 第一集完成时停在视觉阶段入口；全部完成后才把整条轨道标成已完成。
  if (phase === "ready") return 3
  if (phase === "visual-ready") return STEPS.length
  return STEPS.findIndex((step) => step.phase === phase)
}

export default function QuickTrialProgress({
  phase,
  error,
  visualUnits,
  onOpenEpisodes,
  onContinueVisual,
  onOpenFirstFrame,
  onDismiss,
}: Props) {
  const activeIndex = phaseIndex(phase)
  const storyReady = phase === "ready"
  const visualReady = phase === "visual-ready"
  const terminal = storyReady || visualReady
  const title = error
    ? "快速试片停在当前阶段"
    : visualReady
      ? "第 1 镜首帧已生成"
      : storyReady
        ? "第一集故事骨架已生成"
      : `正在生成${STEPS[activeIndex]?.label ?? "样片"}`
  const description = error
    ?? (visualReady
      ? "已完成定妆、场次、第一集分镜和第 1 镜首帧。镜头视频仍需你单独确认。"
      : storyReady
        ? `第一集已完成。继续生成首帧约需 ${visualUnits} 创作额度，不会自动生成视频。`
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
          const done = visualReady || index < activeIndex
          const current = !terminal && index === activeIndex
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
        {storyReady && (
          <button className="wfx-button" type="button" onClick={onContinueVisual}>
            继续生成首帧 · {visualUnits} 额度
          </button>
        )}
        {storyReady && (
          <button className="wfx-button is-secondary" type="button" onClick={onOpenEpisodes}>
            查看第一集
          </button>
        )}
        {visualReady && (
          <button className="wfx-button" type="button" onClick={onOpenFirstFrame}>
            查看首帧
          </button>
        )}
        {(storyReady || visualReady || error) && (
          <button className="wfx-button is-secondary" type="button" onClick={onDismiss}>
            关闭
          </button>
        )}
      </div>
    </section>
  )
}
