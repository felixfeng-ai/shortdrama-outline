import type { QuickCreationTarget } from "./production/quick-trial.ts"
import { MIN_IDEA_LENGTH } from "./types.ts"

export const WORKSPACE_START_STORAGE_KEY = "chengju:workspace-start"

export type WorkspaceStartIntent =
  | { kind: "quick"; idea: string; target: QuickCreationTarget }
  | { kind: "guided"; idea: string }
  | { kind: "sample" }

const QUICK_TARGETS = new Set<QuickCreationTarget>(["story", "keyframe", "video"])

function validIdea(value: unknown): string {
  if (typeof value !== "string") return ""
  const idea = value.trim()
  return idea.length >= MIN_IDEA_LENGTH && idea.length <= 240 ? idea : ""
}

/**
 * 起始页只把用户明确确认过的动作交给完整工作区。
 * 这里同时清洗 sessionStorage 内容，避免旧版本或手工修改的数据触发意外生成。
 */
export function parseWorkspaceStartIntent(raw: string | null): WorkspaceStartIntent | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (value.kind === "sample") return { kind: "sample" }
    if (value.kind === "guided") {
      const idea = validIdea(value.idea)
      return idea ? { kind: "guided", idea } : null
    }
    if (value.kind === "quick") {
      const idea = validIdea(value.idea)
      const target = value.target
      if (idea && QUICK_TARGETS.has(target as QuickCreationTarget)) {
        return { kind: "quick", idea, target: target as QuickCreationTarget }
      }
    }
  } catch {
    // 损坏的临时意图按“没有待启动任务”处理。
  }
  return null
}
