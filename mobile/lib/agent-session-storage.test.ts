import assert from 'node:assert/strict';
import test from 'node:test';

import { initialAgentSessionState } from './agent-session.ts';
import { parseStoredAgentSession, recoverAgentSession } from './agent-session-codec.ts';

test('Agent 草稿、模式和提案可恢复', () => {
  const restored = recoverAgentSession({
    mode: 'create',
    phase: 'proposed',
    draft: '下一镜',
    reply: '先补动作',
    proposal: {
      title: '补动作',
      summary: '先补动作',
      target: '第 3 镜',
      evidence: '当前分镜',
      impact: '一镜',
      cost: '2 单位',
    },
    toolSteps: [],
  });
  assert.equal(restored.mode, 'create');
  assert.equal(restored.draft, '下一镜');
  assert.equal(restored.proposal?.title, '补动作');
});

test('执行中的旧会话恢复为可重试错误', () => {
  const restored = recoverAgentSession({
    ...initialAgentSessionState,
    phase: 'working',
    draft: '检查第三集',
    submittedPrompt: '检查第三集',
  });
  assert.equal(restored.phase, 'error');
  assert.match(restored.error ?? '', /中断/);
  assert.equal(restored.draft, '检查第三集');
});

test('损坏的本地会话被忽略', () => {
  assert.equal(parseStoredAgentSession('{broken'), null);
  assert.equal(parseStoredAgentSession(JSON.stringify({ mode: 'bad' })), null);
});
