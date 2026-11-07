import { IMAGE_GENERATION_UNITS, STEP_COST } from "../model-pricing.ts"

/**
 * 快速试片视觉阶段的额度口径。
 * 包含定妆、场次、分镜和一张首帧；视频不在这条链里自动扣费。
 */
export const QUICK_TRIAL_VISUAL_UNITS =
  STEP_COST.visual
  + STEP_COST.scenes
  + STEP_COST.shots
  + IMAGE_GENERATION_UNITS
