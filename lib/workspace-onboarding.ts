// 空项目首次使用路径只解释每一步会产出什么，不复制六步编辑器正文。
import type { StepKey } from "./types.ts"

export interface OnboardingStep {
  key: StepKey
  label: string
  output: string
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { key: "characters", label: "核心人物", output: "得到角色关系、动机和故事 Canon" },
  { key: "acts", label: "三幕大纲", output: "得到起承转合和主要冲突" },
  { key: "episodes", label: "分集剧情", output: "得到每集梗概、钩子和追更节奏" },
  { key: "visuals", label: "角色定妆", output: "得到跨镜头一致的角色视觉锚点" },
  { key: "scenes", label: "场次剧本", output: "把分集拆成可执行的场次" },
  { key: "shots", label: "分镜与视频", output: "得到镜头、首帧、视频和成片" },
] as const
