// 快速试片断点请求封装：流程状态始终由项目级 API 保存，页面刷新后可重新读取。
import { patchJson, postJson } from "@/lib/api"
import type {
  QuickTrialPhase,
  QuickTrialRunDto,
  QuickTrialRunStatus,
} from "./quick-trial"

export type { QuickTrialRunDto } from "./quick-trial"

function endpoint(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/quick-trial`
}

export async function fetchQuickTrialRun(
  projectId: string,
): Promise<QuickTrialRunDto | null> {
  const response = await fetch(endpoint(projectId), { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "快速试片状态读取失败")
  }
  return payload.data.run as QuickTrialRunDto | null
}

export function startQuickTrialRun(
  projectId: string,
  idea: string,
): Promise<QuickTrialRunDto> {
  return postJson<{ run: QuickTrialRunDto }>(endpoint(projectId), { idea })
    .then((data) => data.run)
}

export function updateQuickTrialRun(
  projectId: string,
  input: {
    phase?: QuickTrialPhase
    status?: QuickTrialRunStatus
    error?: string | null
    visualApproved?: boolean
  },
): Promise<QuickTrialRunDto> {
  return patchJson<{ run: QuickTrialRunDto }>(endpoint(projectId), input)
    .then((data) => data.run)
}

/**
 * 只有用户看过费用确认弹窗后才会调用。
 * 这个标记允许刷新后继续视觉阶段，但不会扩展成镜头视频授权。
 */
export function markQuickTrialVisualApproved(
  projectId: string,
): Promise<QuickTrialRunDto> {
  return updateQuickTrialRun(projectId, {
    visualApproved: true,
    status: "active",
    error: null,
  })
}
