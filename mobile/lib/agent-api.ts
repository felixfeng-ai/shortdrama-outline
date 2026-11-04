import type { AgentProposal } from './agent-session.ts';
import type { AgentProjectContext } from './workspace-api.ts';
import { resolveApiBaseUrl } from './workspace-api.ts';

export type MobileAgentCard =
  | {
      kind: 'shot-edit';
      shot: number;
      target: 'prompt' | 'action';
      text: string;
      summary: string;
    }
  | {
      kind: 'regenerate';
      step: string;
      stepLabel: string;
      reason: string;
    };

export interface MobileAgentResponse {
  reply: string;
  toolNames: string[];
  cards: MobileAgentCard[];
  modelCalls: number;
  degraded: boolean;
  projectId?: string;
  baseShotsSnapshotId?: string | null;
}

export interface MobileShotEdit {
  shot: number;
  target: 'prompt' | 'action';
  text: string;
  summary: string;
}

export interface AgentTurnResult {
  reply: string;
  proposal?: AgentProposal;
  toolNames: string[];
  modelCalls: number;
  degraded: boolean;
  baseShotsSnapshotId?: string;
  shotEdit?: MobileShotEdit;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

const TOOL_LABELS: Record<string, string> = {
  get_project_status: '项目状态',
  audit_shots: '分镜',
  review_episodes: '分集',
  get_quota: '额度',
  search_docs: '文档',
  propose_shot_edit: '镜头建议',
  propose_regenerate: '重跑建议',
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

function readResponse(value: unknown): MobileAgentResponse {
  if (!value || typeof value !== 'object') throw new Error('Agent 返回了无法识别的内容');
  const data = value as Partial<MobileAgentResponse>;
  if (typeof data.reply !== 'string') throw new Error('Agent 没有返回回答');
  return {
    reply: data.reply,
    toolNames: Array.isArray(data.toolNames)
      ? data.toolNames.filter((name): name is string => typeof name === 'string')
      : [],
    cards: Array.isArray(data.cards) ? (data.cards as MobileAgentCard[]) : [],
    modelCalls: Number.isFinite(data.modelCalls) ? Number(data.modelCalls) : 0,
    degraded: data.degraded === true,
    projectId: typeof data.projectId === 'string' ? data.projectId : undefined,
    baseShotsSnapshotId:
      typeof data.baseShotsSnapshotId === 'string' ? data.baseShotsSnapshotId : null,
  };
}

export async function runAgentTurn(
  baseUrl: string,
  input: { projectId: string; prompt: string },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<MobileAgentResponse> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置 Agent 服务地址');

  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/mobile/agent`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接 AI 场记，请检查网络后重试');
  }

  let payload: ApiEnvelope<MobileAgentResponse>;
  try {
    payload = (await response.json()) as ApiEnvelope<MobileAgentResponse>;
  } catch {
    throw new Error('Agent 返回了无法识别的内容');
  }
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || 'AI 场记暂时没有回应');
  }
  return readResponse(payload.data);
}

export function mapAgentResponse(
  response: MobileAgentResponse,
  context: AgentProjectContext,
): AgentTurnResult {
  const card = response.cards[0];
  let proposal: AgentProposal | undefined;

  if (card?.kind === 'shot-edit') {
    proposal = {
      title: `第 ${card.shot} 镜 · ${card.summary}`,
      summary: response.reply,
      target: context.targetLabel,
      evidence: context.evidence,
      impact: `仅生成第 ${card.shot} 镜${card.target === 'prompt' ? '提示词' : '动作'}建议，尚未写入项目`,
      cost: `${response.modelCalls} 单位`,
    };
  } else if (card?.kind === 'regenerate') {
    proposal = {
      title: `建议重跑${card.stepLabel}`,
      summary: response.reply,
      target: context.contextLabel,
      evidence: context.evidence,
      impact: `${card.reason}；尚未触发重跑`,
      cost: `${response.modelCalls} 单位`,
    };
  }

  return {
    reply: response.reply,
    proposal,
    toolNames: response.toolNames,
    modelCalls: response.modelCalls,
    degraded: response.degraded,
    baseShotsSnapshotId: response.baseShotsSnapshotId ?? undefined,
    shotEdit:
      card?.kind === 'shot-edit'
        ? {
            shot: card.shot,
            target: card.target,
            text: card.text,
            summary: card.summary,
          }
        : undefined,
  };
}

export interface AgentApplyResult {
  snapshotId: string;
  version: number;
  shot: number;
}

export async function applyAgentSuggestion(
  baseUrl: string,
  input: {
    projectId: string;
    baseSnapshotId: string;
    edit: MobileShotEdit;
  },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AgentApplyResult> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置 Agent 服务地址');

  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/mobile/agent/apply`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法写入项目，请检查网络后重试');
  }

  let payload: ApiEnvelope<AgentApplyResult>;
  try {
    payload = (await response.json()) as ApiEnvelope<AgentApplyResult>;
  } catch {
    throw new Error('写入接口返回了无法识别的内容');
  }
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || '写入项目失败');
  }
  if (
    typeof payload.data.snapshotId !== 'string' ||
    !Number.isFinite(payload.data.version) ||
    !Number.isFinite(payload.data.shot)
  ) {
    throw new Error('写入结果不完整');
  }
  return payload.data;
}
