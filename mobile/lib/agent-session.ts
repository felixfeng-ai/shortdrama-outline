import { AGENT_STEPS } from './app-data.ts';
import type { AgentTurnResult, MobileShotEdit } from './agent-api.ts';
import type { AgentProjectContext } from './workspace-api.ts';

export type AgentMode = 'chat' | 'create';
export type AgentPhase =
  | 'idle'
  | 'working'
  | 'proposed'
  | 'stopped'
  | 'applying'
  | 'applied'
  | 'apply-error'
  | 'error';

export interface AgentProposal {
  title: string;
  summary: string;
  target: string;
  evidence: string;
  impact: string;
  cost: string;
}

export interface AgentSessionState {
  mode: AgentMode;
  phase: AgentPhase;
  draft: string;
  submittedMode?: AgentMode;
  submittedPrompt?: string;
  projectContext?: AgentProjectContext;
  proposal?: AgentProposal;
  reply?: string;
  toolNames?: string[];
  modelCalls?: number;
  degraded?: boolean;
  error?: string;
  baseShotsSnapshotId?: string;
  shotEdit?: MobileShotEdit;
  appliedVersion?: number;
  reviewShotNumber?: number;
  reviewRoute?: '/review/shot-17';
  toolSteps: readonly string[];
}

export type AgentSessionAction =
  | { type: 'mode'; mode: AgentMode }
  | { type: 'draft'; value: string }
  | { type: 'submit'; context?: AgentProjectContext }
  | { type: 'complete'; result?: AgentTurnResult }
  | { type: 'fail'; message: string }
  | { type: 'start-apply' }
  | { type: 'apply-success'; version: number }
  | { type: 'apply-fail'; message: string }
  | { type: 'stop' }
  | { type: 'accept' }
  | { type: 'dismiss' };

export const AGENT_PROMPTS: Record<AgentMode, readonly string[]> = {
  chat: ['收紧第 3 集钩子', '看看今天还差什么', '这句台词是不是太重'],
  create: ['补一场雨夜冲突', '换一个更冷的开场', '写第 18 镜的动作'],
};

export const initialAgentSessionState: AgentSessionState = {
  mode: 'chat',
  phase: 'idle',
  draft: '',
  toolSteps: [],
};

export const DEFAULT_AGENT_CONTEXT: AgentProjectContext = {
  projectTitle: '夜港来信',
  contextLabel: '夜港来信 · 第 3 集 · 场 12',
  targetLabel: 'EP03 · 场 12 · 第 17 镜',
  evidence: '24 个镜头 · 潮汐之后 · 码头夜谈',
  shotCount: 24,
  sceneLabel: '码头夜谈',
};

export function agentIntro(
  mode: AgentMode,
  context: AgentProjectContext = DEFAULT_AGENT_CONTEXT,
): string {
  if (context.shotCount === 0) {
    return '这个项目还没有分镜。先告诉我一句想法或一个场景，我们从头开始。';
  }
  const shortScene = context.sceneLabel.split('·').at(-1)?.trim() || context.sceneLabel;
  return mode === 'chat'
    ? `已读 ${context.shotCount} 镜，从「${shortScene}」最后一个动作收紧。`
    : '给我一个动作或情绪，我会直接写成能拍的镜头，并标出角色与场景锚点。';
}

export function buildAgentProposal(
  mode: AgentMode,
  prompt: string,
  context: AgentProjectContext = DEFAULT_AGENT_CONTEXT,
): AgentProposal {
  if (mode === 'create') {
    return {
      title: '先补一个不解释的动作',
      summary: `我会围绕“${prompt}”补一个可拍的短动作，不新增设定，也不改动本集主线。`,
      target: context.targetLabel,
      evidence: context.evidence,
      impact: `影响当前位置附近镜头，新增 1 个 10 秒镜头`,
      cost: '1 个镜头 · 约 ¥0.42',
    };
  }

  return {
    title: '把余味留到动作之后',
    summary: `针对“${prompt}”，我建议只调整当前场次最后一个动作的落点，先保留镜头长度和现有角色锚点。`,
    target: context.targetLabel,
    evidence: context.evidence,
    impact: '影响当前位置前后镜头，不新增台词',
    cost: '1 个镜头 · 约 ¥0.42',
  };
}

function idleState(mode: AgentMode): AgentSessionState {
  return {
    mode,
    phase: 'idle',
    draft: '',
    toolSteps: [],
  };
}

export function agentSessionReducer(
  state: AgentSessionState,
  action: AgentSessionAction,
): AgentSessionState {
  switch (action.type) {
    case 'mode':
      return { ...state, mode: action.mode };

    case 'draft':
      if (state.phase === 'working') return state;
      return { ...state, draft: action.value };

    case 'submit': {
      if (['working', 'proposed', 'applying', 'apply-error'].includes(state.phase)) return state;
      const prompt = state.draft.trim();
      if (!prompt) return state;
      return {
        ...state,
        phase: 'working',
        draft: prompt,
        projectContext: action.context ?? state.projectContext,
        submittedMode: state.mode,
        submittedPrompt: prompt,
        proposal: undefined,
        reply: undefined,
        toolNames: undefined,
        modelCalls: undefined,
        degraded: undefined,
        error: undefined,
        baseShotsSnapshotId: undefined,
        shotEdit: undefined,
        appliedVersion: undefined,
        reviewShotNumber: undefined,
        reviewRoute: undefined,
        toolSteps: AGENT_STEPS,
      };
    }

    case 'complete':
      if (state.phase !== 'working' || !state.submittedPrompt) return state;
      {
        const proposal =
          action.result?.proposal ??
          (action.result
            ? undefined
            : buildAgentProposal(
                state.submittedMode ?? state.mode,
                state.submittedPrompt,
                state.projectContext,
              ));
      return {
        ...state,
        phase: 'proposed',
        draft: '',
        proposal,
        reply: action.result?.reply ?? proposal?.summary,
        toolNames: action.result?.toolNames,
        modelCalls: action.result?.modelCalls,
        degraded: action.result?.degraded,
        baseShotsSnapshotId: action.result?.baseShotsSnapshotId,
        shotEdit: action.result?.shotEdit,
        appliedVersion: undefined,
        reviewShotNumber: action.result?.shotEdit?.shot,
        error: undefined,
        toolSteps: [],
      };
      }

    case 'fail':
      if (state.phase !== 'working') return state;
      return {
        ...state,
        phase: 'error',
        proposal: undefined,
        reply: undefined,
        toolNames: undefined,
        modelCalls: undefined,
        degraded: undefined,
        error: action.message,
        reviewShotNumber: undefined,
        toolSteps: [],
      };

    case 'start-apply':
      if (state.phase !== 'proposed' && state.phase !== 'apply-error') return state;
      if (!state.shotEdit || !state.baseShotsSnapshotId) return state;
      return {
        ...state,
        phase: 'applying',
        error: undefined,
      };

    case 'apply-success':
      if (state.phase !== 'applying') return state;
      return {
        ...state,
        phase: 'applied',
        appliedVersion: action.version,
        error: undefined,
      };

    case 'apply-fail':
      if (state.phase !== 'applying') return state;
      return {
        ...state,
        phase: 'apply-error',
        error: action.message,
      };

    case 'stop':
      if (state.phase !== 'working') return state;
      return {
        ...state,
        phase: 'stopped',
        proposal: undefined,
        reply: undefined,
        toolNames: undefined,
        modelCalls: undefined,
        degraded: undefined,
        error: undefined,
        baseShotsSnapshotId: undefined,
        shotEdit: undefined,
        appliedVersion: undefined,
        reviewShotNumber: undefined,
        reviewRoute: undefined,
        toolSteps: [],
      };

    case 'accept':
      if (state.phase !== 'proposed') return state;
      return {
        ...state,
        phase: 'applied',
        draft: '',
        appliedVersion: undefined,
        reviewShotNumber: state.shotEdit?.shot ?? 17,
        reviewRoute: '/review/shot-17',
      };

    case 'dismiss':
      if (!['proposed', 'stopped', 'applied', 'apply-error'].includes(state.phase)) return state;
      return idleState(state.mode);
  }
}
