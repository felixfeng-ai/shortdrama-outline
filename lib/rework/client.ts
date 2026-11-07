import { postJson } from "../api.ts"
import type { Shot } from "../assets/types.ts"
import type { SnapshotDto } from "../assets/api.ts"
import type { BatchReworkAction } from "./plan.ts"

export interface BatchReworkResponse {
  shots: Shot[]
  changedIds: string[]
  snapshot: SnapshotDto | null
}

/** 总览与分镜 QC 共用的批量返修入口；不传 shotIds 表示当前全部镜头。 */
export async function applyProjectRework(
  projectId: string,
  input: {
    action: BatchReworkAction
    shotIds?: string[]
  },
): Promise<BatchReworkResponse> {
  return postJson<BatchReworkResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/rework/batch`,
    input,
  )
}
