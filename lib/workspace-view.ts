import type { TodoItem } from "./todo.ts"
import type { StepKey } from "./types.ts"

/**
 * 确认稿把“当前正在处理的步骤”放在项目菜单第一位，
 * 其余步骤仍按短剧生产顺序排列。
 */
export const WORKSPACE_STEP_ORDER: readonly StepKey[] = [
  "characters",
  "acts",
  "episodes",
  "visuals",
  "scenes",
  "shots",
]

export const WORKSPACE_STEP_LABELS: Record<StepKey, string> = {
  characters: "核心人物",
  acts: "三幕大纲",
  episodes: "分集剧情",
  visuals: "角色定妆",
  scenes: "场次剧本",
  shots: "分镜",
}

export function workspaceStepLabel(step: StepKey): string {
  return WORKSPACE_STEP_LABELS[step]
}

export function orderWorkspaceSteps(steps: readonly StepKey[], current: StepKey): StepKey[] {
  const available = new Set(steps)
  const ordered = WORKSPACE_STEP_ORDER.filter((step) => available.has(step))
  return [current, ...ordered.filter((step) => step !== current)]
}

interface ShotForSelection {
  id: string
  shot: number
  status: string
  missingRefFor: readonly string[]
}

/**
 * 首页先展示最需要人处理的一镜：
 * 返修 > 缺参考图 > 未完成 > 第一镜。
 */
export function selectCurrentShot<T extends ShotForSelection>(shots: readonly T[]): T | null {
  if (shots.length === 0) return null
  return (
    shots.find((shot) => shot.status === "rework") ??
    shots.find((shot) => shot.missingRefFor.length > 0) ??
    shots.find((shot) => shot.status !== "done") ??
    [...shots].sort((a, b) => a.shot - b.shot)[0]
  )
}

interface PulseInput {
  episodes: number
  scenes: number
  shots: number
  todoItems: readonly { kind: "next" | "fix" }[]
}

export interface ProjectPulse {
  episodes: number
  scenes: number
  shots: number
  blockers: number
}

export function buildProjectPulse<T extends PulseInput>(input: T): ProjectPulse {
  return {
    episodes: Math.max(0, input.episodes),
    scenes: Math.max(0, input.scenes),
    shots: Math.max(0, input.shots),
    blockers: input.todoItems.filter((item) => item.kind === "fix").length,
  }
}

export function formatWorkspaceSaved(updatedAt?: number | null): string {
  if (!updatedAt) return "尚未保存"
  return `最后保存 ${new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(updatedAt))}`
}
