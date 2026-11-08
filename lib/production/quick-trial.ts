import {
  IMAGE_GENERATION_UNITS,
  QUOTA_UNIT_MICROS,
  STEP_COST,
  quotaUnitsForCostMicros,
} from "../model-pricing.ts"
import { episodeQuotaUnits } from "../episodes.ts"

export const QUICK_CREATION_TARGETS = ["story", "keyframe", "video"] as const
export type QuickCreationTarget = (typeof QUICK_CREATION_TARGETS)[number]

export interface QuickCreationVideoPrice {
  enabled: boolean
  model: string
  resolution: string
  durationSeconds: number
  costMicros: number
}

export interface QuickCreationQuote {
  target: QuickCreationTarget
  label: string
  description: string
  units: number
  totalMicros: number
  videoCostMicros: number
  estimatedSeconds: number
  steps: string[]
  available: boolean
  unavailableReason: string | null
  video: QuickCreationVideoPrice | null
}

export type QuickCreationQuotes = Record<QuickCreationTarget, QuickCreationQuote>

export const QUICK_TRIAL_STORYBOARD_SHOT_COUNT = 5

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
  "video",
  "video-ready",
] as const

export type QuickTrialPhase = (typeof QUICK_TRIAL_PHASES)[number]
export type QuickTrialRunStatus = "active" | "completed" | "failed"

export interface QuickTrialRunDto {
  projectId: string
  idea: string
  phase: QuickTrialPhase
  status: QuickTrialRunStatus
  error: string | null
  target: QuickCreationTarget
  budgetUnits: number
  budgetMicros: number
  visualApproved: boolean
  videoApproved: boolean
  videoBudgetMicros: number
  videoModel: string | null
  videoResolution: string | null
  videoDurationSeconds: number
  createdAt: number
  updatedAt: number
}

/**
 * 快速试片视觉阶段的额度口径。
 * 包含定妆、场次、分镜和五张首帧；视频不在这条链里自动扣费。
 */
export const QUICK_TRIAL_VISUAL_UNITS =
  STEP_COST.visual
  + STEP_COST.scenes
  + STEP_COST.shots
  + IMAGE_GENERATION_UNITS * QUICK_TRIAL_STORYBOARD_SHOT_COUNT

export const QUICK_TRIAL_STORY_UNITS =
  STEP_COST.characters
  + STEP_COST.acts
  + episodeQuotaUnits(1)

export function isQuickCreationTarget(value: unknown): value is QuickCreationTarget {
  return typeof value === "string"
    && QUICK_CREATION_TARGETS.includes(value as QuickCreationTarget)
}

/**
 * 快速创作的价格只在服务端读取真实视频配置后生成。
 * 三类范围共用同一额度口径，视频费用再换算为平台额度并计入总预算。
 */
export function buildQuickCreationQuotes(
  videoInput?: QuickCreationVideoPrice,
): QuickCreationQuotes {
  const video = videoInput ?? {
    enabled: false,
    model: "",
    resolution: "",
    durationSeconds: 5,
    costMicros: 0,
  }
  const videoUnits = video.costMicros > 0
    ? quotaUnitsForCostMicros(video.costMicros)
    : 0
  const storyUnits = QUICK_TRIAL_STORY_UNITS
  const keyframeUnits = storyUnits + QUICK_TRIAL_VISUAL_UNITS
  const videoTotalUnits = keyframeUnits + videoUnits
  const missingVideoReason = video.enabled
    ? null
    : "视频生成尚未启用或视频服务未配置，暂时不能选择单镜头视频。"

  const make = (
    target: QuickCreationTarget,
    label: string,
    description: string,
    units: number,
    estimatedSeconds: number,
    steps: string[],
    available = true,
    unavailableReason: string | null = null,
    videoCostMicros = 0,
    includeVideo = false,
  ): QuickCreationQuote => ({
    target,
    label,
    description,
    units,
    totalMicros: units * QUOTA_UNIT_MICROS,
    videoCostMicros,
    estimatedSeconds,
    steps,
    available,
    unavailableReason,
    video: includeVideo ? video : null,
  })

  return {
    story: make(
      "story",
      "故事样片",
      "到第一集分集完成，先判断人物、钩子和冲突。",
      storyUnits,
      120,
      ["人物", "三幕", "第一集"],
    ),
    keyframe: make(
      "keyframe",
      "动态分镜",
      "继续完成定妆、场次、分镜和前 5 镜已采用首帧，直接播放 30 秒动态分镜。",
      keyframeUnits,
      360,
      ["人物", "三幕", "第一集", "定妆", "场次", "分镜", "5 张首帧"],
    ),
    video: make(
      "video",
      "单镜头视频",
      `在前 5 镜首帧后，为第 1 镜生成一条 ${video.durationSeconds} 秒视频。`,
      videoTotalUnits,
      600,
      ["人物", "三幕", "第一集", "定妆", "场次", "分镜", "5 张首帧", "镜头视频"],
      video.enabled,
      missingVideoReason,
      video.costMicros,
      true,
    ),
  }
}

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
  "video",
  "video-ready",
]

/**
 * 服务端 phase 表示“最后完成阶段”，界面要展示的却是下一步。
 * 首集完成且尚未确认费用时显示 ready；完成后显示 visual-ready。
 */
export function quickTrialDisplayPhase(run: QuickTrialRunDto): QuickTrialPhase {
  if (run.status === "completed") {
    if (run.target === "story") return "ready"
    if (run.target === "video") return "video-ready"
    return "visual-ready"
  }
  if (run.phase === "video-ready") return "video-ready"
  if (run.phase === "visual-ready") return run.target === "video" ? "video" : "visual-ready"
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

export function quickCreationTargetIncludesVisuals(target: QuickCreationTarget): boolean {
  return target === "keyframe" || target === "video"
}

export function quickCreationTargetIncludesVideo(target: QuickCreationTarget): boolean {
  return target === "video"
}

export function quickTrialCompletedAtLeast(
  completed: QuickTrialPhase,
  target: QuickTrialPhase,
): boolean {
  return QUICK_TRIAL_RESUME_ORDER.indexOf(completed)
    >= QUICK_TRIAL_RESUME_ORDER.indexOf(target)
}
