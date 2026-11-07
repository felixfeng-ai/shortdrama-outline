import { IMAGE_GENERATION_UNITS, STEP_COST } from "../model-pricing.ts"

export const QUICK_TRIAL_PHASES = [
  "start",
  "characters",
  "acts",
  "episodes",
  "ready",
  "visuals",
  "scenes",
  "shots",
  "keyframe",
  "visual-ready",
] as const

export type QuickTrialPhase = (typeof QUICK_TRIAL_PHASES)[number]
export type QuickTrialRunStatus = "active" | "completed" | "failed"

export interface QuickTrialRunDto {
  projectId: string
  idea: string
  phase: QuickTrialPhase
  status: QuickTrialRunStatus
  error: string | null
  visualApproved: boolean
  createdAt: number
  updatedAt: number
}

/**
 * 快速试片视觉阶段的额度口径。
 * 包含定妆、场次、分镜和一张首帧；视频不在这条链里自动扣费。
 */
export const QUICK_TRIAL_VISUAL_UNITS =
  STEP_COST.visual
  + STEP_COST.scenes
  + STEP_COST.shots
  + IMAGE_GENERATION_UNITS

export function isQuickTrialPhase(value: unknown): value is QuickTrialPhase {
  return typeof value === "string"
    && QUICK_TRIAL_PHASES.includes(value as QuickTrialPhase)
}

export function isQuickTrialRunStatus(value: unknown): value is QuickTrialRunStatus {
  return value === "active" || value === "completed" || value === "failed"
}

const QUICK_TRIAL_RESUME_ORDER: QuickTrialPhase[] = [
  "start",
  "characters",
  "acts",
  "episodes",
  "visuals",
  "scenes",
  "shots",
  "keyframe",
  "visual-ready",
]

/**
 * 服务端 phase 表示“最后完成阶段”，界面要展示的却是下一步。
 * 首集完成且尚未确认费用时显示 ready；完成后显示 visual-ready。
 */
export function quickTrialDisplayPhase(run: QuickTrialRunDto): QuickTrialPhase {
  if (run.status === "completed" || run.phase === "visual-ready") {
    return "visual-ready"
  }
  if (run.phase === "episodes" && !run.visualApproved) return "ready"
  return nextQuickTrialPhase(run.phase)
}

export function nextQuickTrialPhase(phase: QuickTrialPhase): QuickTrialPhase {
  const index = QUICK_TRIAL_RESUME_ORDER.indexOf(phase)
  if (index < 0 || index >= QUICK_TRIAL_RESUME_ORDER.length - 1) {
    return phase
  }
  return QUICK_TRIAL_RESUME_ORDER[index + 1]
}

export function isQuickTrialStoryPhase(phase: QuickTrialPhase): boolean {
  return phase === "start" || phase === "characters" || phase === "acts"
}

export function quickTrialCompletedAtLeast(
  completed: QuickTrialPhase,
  target: QuickTrialPhase,
): boolean {
  return QUICK_TRIAL_RESUME_ORDER.indexOf(completed)
    >= QUICK_TRIAL_RESUME_ORDER.indexOf(target)
}
