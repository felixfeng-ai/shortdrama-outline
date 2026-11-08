"use client"

import type {
  QuickCreationTarget,
  QuickTrialPhase,
} from "@/lib/production/quick-trial"

/**
 * 快速试片运行条只表达真实完成阶段。
 * ready 允许继续生成视觉样片；visual-ready 才代表动态分镜可用。
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
  onOpenStoryboard: () => void
  onRetry: () => void
  onDismiss: () => void
}

interface MacroStep {
  id: "story" | "visual" | "keyframe" | "video"
  label: string
  detail: string
}

function macroStepsFor(target: QuickCreationTarget): MacroStep[] {
  if (target === "story") {
    return [
      { id: "story", label: "故事骨架", detail: "核心人物、三幕大纲、第一集" },
      { id: "keyframe", label: "第一集完成", detail: "钩子、冲突和开篇节奏" },
    ]
  }
  const steps: MacroStep[] = [
    { id: "story", label: "故事骨架", detail: "核心人物、三幕大纲、第一集" },
    { id: "visual", label: "视觉定妆", detail: "角色、场次和分镜" },
    { id: "keyframe", label: "动态分镜", detail: "前 5 镜首帧已采用" },
  ]
  if (target === "video") {
    steps.push({ id: "video", label: "镜头视频", detail: "第一条可播放视频" })
  }
  return steps
}

function activeMacroIndex(
  phase: QuickTrialPhase,
  target: QuickCreationTarget,
  terminal: boolean,
): number {
  if (terminal) return macroStepsFor(target).length
  if (phase === "start" || phase === "characters" || phase === "acts") return 0
  if (phase === "episodes" || phase === "ready") return target === "story" ? 0 : 1
  if (phase === "visuals" || phase === "scenes" || phase === "shots") return 1
  if (phase === "keyframe") return 2
  if (phase === "visual-ready") return target === "video" ? 3 : macroStepsFor(target).length
  if (phase === "video") return 3
  return macroStepsFor(target).length
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
  onOpenStoryboard,
  onRetry,
  onDismiss,
}: Props) {
  const storyReady = target === "story" && phase === "ready"
  const visualReady = target === "keyframe" && phase === "visual-ready"
  const videoReady = target === "video" && phase === "video-ready"
  const terminal = storyReady || visualReady || videoReady
  const macroSteps = macroStepsFor(target)
  const activeIndex = Math.min(
    activeMacroIndex(phase, target, terminal),
    macroSteps.length,
  )
  const visibleIndex = Math.min(activeIndex, macroSteps.length - 1)
  const currentStep = macroSteps[visibleIndex]
  const title = error
    ? "快速创作停在当前阶段"
    : videoReady
      ? "单镜头视频样片已生成"
      : visualReady
      ? "动态分镜已就绪"
      : storyReady
        ? "故事样片已完成"
        : `正在生成${currentStep?.label ?? "样片"}`
  const description = error
    ?? (videoReady
      ? "已完成故事、定妆、场次、分镜、5 张首帧和第 1 镜视频，视频已保存为候选版本。"
      : visualReady
      ? "已完成定妆、场次、第一集分镜和 5 张已采用首帧，没有继续生成视频。"
      : storyReady
        ? "第一集已完成。本次确认范围只到故事样片，没有生成图片或视频。"
        : `当前：${currentStep?.label ?? "样片"}。刷新后会从最后完成阶段继续。`)

  return (
    <section className="wfx-quick-trial-progress" aria-live="polite">
      <div className="wfx-quick-trial-copy">
        <span>快速创作</span>
        <b>{title}</b>
        <p className={error ? "is-error" : ""}>{description}</p>
      </div>

      <div
        className="wfx-quick-trial-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={macroSteps.length}
        aria-valuenow={activeIndex}
      >
        <i style={{ width: `${Math.round((activeIndex / macroSteps.length) * 100)}%` }} />
      </div>

      <ol className="wfx-quick-trial-macros" aria-label="快速创作进度">
        {macroSteps.map((step, index) => {
          const done = index < activeIndex || terminal
          const current = !terminal && index === activeIndex
          return (
            <li
              key={step.id}
              className={`${done ? "is-done" : ""} ${current ? "is-current" : ""} ${current && error ? "is-error" : ""}`}
            >
              <i />
              <span>
                <b>{step.label}</b>
                <small>{step.detail}</small>
              </span>
            </li>
          )
        })}
      </ol>

      <div className="wfx-quick-trial-actions">
        {storyReady && (
          <button className="wfx-button" type="button" onClick={onContinueVisual}>
            追加动态分镜 · {visualUnits} 额度
          </button>
        )}
        {storyReady && (
          <button className="wfx-button is-secondary" type="button" onClick={onOpenEpisodes}>
            查看第一集
          </button>
        )}
        {visualReady && (
          <button className="wfx-button" type="button" onClick={onOpenFirstFrame}>
            打开动态分镜
          </button>
        )}
        {videoReady && (
          <button className="wfx-button" type="button" onClick={onOpenVideo}>
            查看视频
          </button>
        )}
        {(visualReady || videoReady) && (
          <button className="wfx-button is-secondary" type="button" onClick={onOpenStoryboard}>
            播放动态分镜
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
