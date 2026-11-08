"use client"

import type {
  QuickCreationTarget,
  QuickTrialPhase,
} from "@/lib/production/quick-trial"

/**
 * 快速试片运行条只表达真实完成阶段。
 * ready 允许继续生成视觉样片；visual-ready 才代表首帧可用。
 */
interface Props {
  phase: QuickTrialPhase
  target: QuickCreationTarget
  error: string | null
  visualUnits: number
  onOpenEpisodes: () => void
  onContinueVisual: () => void
  onOpenFirstFrame: () => void
  onOpenVideo: () => void
  onRetry: () => void
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
  { phase: "video", label: "镜头视频" },
]

function visibleStepCount(target: QuickCreationTarget): number {
  if (target === "story") return 3
  if (target === "keyframe") return 7
  return STEPS.length
}

function completedStepCount(phase: QuickTrialPhase, target: QuickCreationTarget): number {
  if (phase === "ready") return 3
  if (phase === "visual-ready") return 7
  if (phase === "video-ready") return 8
  const index = STEPS.findIndex((step) => step.phase === phase)
  return Math.max(0, index)
}

export default function QuickTrialProgress({
  phase,
  target,
  error,
  visualUnits,
  onOpenEpisodes,
  onContinueVisual,
  onOpenFirstFrame,
  onOpenVideo,
  onRetry,
  onDismiss,
}: Props) {
  const steps = STEPS.slice(0, visibleStepCount(target))
  const completedCount = Math.min(completedStepCount(phase, target), steps.length)
  const activeIndex = Math.min(completedCount, steps.length - 1)
  const storyReady = target === "story" && phase === "ready"
  const visualReady = target === "keyframe" && phase === "visual-ready"
  const videoReady = target === "video" && phase === "video-ready"
  const terminal = storyReady || visualReady || videoReady
  const title = error
    ? "快速创作停在当前阶段"
    : videoReady
      ? "单镜头视频样片已生成"
      : visualReady
      ? "第 1 镜首帧已生成"
      : storyReady
        ? "故事样片已完成"
        : `正在生成${steps[activeIndex]?.label ?? "样片"}`
  const description = error
    ?? (videoReady
      ? "已完成故事、定妆、场次、分镜、首帧和第 1 镜视频，视频已保存为候选版本。"
      : visualReady
      ? "已完成定妆、场次、第一集分镜和第 1 镜首帧，没有继续生成视频。"
      : storyReady
        ? "第一集已完成。本次确认范围只到故事样片，没有生成图片或视频。"
        : `本次只执行到${target === "video" ? "单镜头视频" : "首帧样片"}；刷新后会从最后完成阶段继续。`)

  return (
    <section className="wfx-quick-trial-progress" aria-live="polite">
      <div className="wfx-quick-trial-copy">
        <span>快速创作</span>
        <b>{title}</b>
        <p className={error ? "is-error" : ""}>{description}</p>
      </div>

      <ol className="wfx-quick-trial-steps" aria-label="快速创作进度">
        {steps.map((step, index) => {
          const done = index < completedCount || terminal
          const current = !terminal && index === completedCount
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
            追加首帧 · {visualUnits} 额度
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
        {videoReady && (
          <button className="wfx-button" type="button" onClick={onOpenVideo}>
            查看视频
          </button>
        )}
        {error && !storyReady && !visualReady && (
          <button className="wfx-button" type="button" onClick={onRetry}>
            从当前阶段重试
          </button>
        )}
        {(storyReady || visualReady || videoReady || error) && (
          <button className="wfx-button is-secondary" type="button" onClick={onDismiss}>
            关闭
          </button>
        )}
      </div>
    </section>
  )
}
