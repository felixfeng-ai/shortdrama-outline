import {
  initialAgentSessionState,
  type AgentMode,
  type AgentPhase,
  type AgentSessionState,
} from './agent-session.ts';

const MODES: AgentMode[] = ['chat', 'create'];
const PHASES: AgentPhase[] = [
  'idle',
  'working',
  'proposed',
  'stopped',
  'applying',
  'applied',
  'apply-error',
  'error',
];

export function recoverAgentSession(value: AgentSessionState): AgentSessionState {
  const interrupted = value.phase === 'working' || value.phase === 'applying';
  return {
    ...initialAgentSessionState,
    ...value,
    phase: interrupted ? 'error' : value.phase,
    draft: value.draft ?? value.submittedPrompt ?? '',
    error: interrupted
      ? '上次 Agent 执行在 App 退出时中断，可以重新发送。'
      : value.error,
    toolSteps: [],
  };
}

export function parseStoredAgentSession(value: string | null): AgentSessionState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as AgentSessionState;
    if (
      !parsed
      || typeof parsed !== 'object'
      || !MODES.includes(parsed.mode)
      || !PHASES.includes(parsed.phase)
      || typeof parsed.draft !== 'string'
    ) {
      return null;
    }
    return recoverAgentSession(parsed);
  } catch {
    return null;
  }
}
