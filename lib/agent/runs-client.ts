import { postJson } from "../api.ts"
import type { AgentActionPlan } from "./plan.ts"
import type { AgentActionRunDto } from "./runs.ts"

interface ApplyAgentActionResponse {
  run: AgentActionRunDto
  beforeSnapshot: { id: string; version: number }
  afterSnapshot: { id: string; version: number }
}

export interface RollbackAgentRunResponse {
  run: AgentActionRunDto
  snapshot: { id: string; version: number }
  payload: unknown
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || fallback)
  return payload.data as T
}

export async function listAgentRuns(projectId: string): Promise<AgentActionRunDto[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/agent-runs`,
    { cache: "no-store" },
  )
  const data = await readJson<{ runs: AgentActionRunDto[] }>(response, "执行记录读取失败")
  return data.runs
}

export async function applyAgentAction(
  projectId: string,
  plan: AgentActionPlan,
  beforePayload: unknown,
  afterPayload: unknown,
): Promise<ApplyAgentActionResponse> {
  return postJson<ApplyAgentActionResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/agent-runs`,
    {
      projectId,
      actionKind: plan.actionKind,
      artifactKind: plan.artifactKind,
      targetType: plan.targetType,
      targetId: plan.targetId,
      targetLabel: plan.targetLabel,
      field: plan.field,
      summary: plan.summary,
      beforePayload,
      afterPayload,
    },
  )
}

export async function rollbackAgentRun(
  projectId: string,
  runId: string,
): Promise<RollbackAgentRunResponse> {
  return postJson<RollbackAgentRunResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/agent-runs/${encodeURIComponent(runId)}/rollback`,
    {},
  )
}
