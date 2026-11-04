import assert from 'node:assert/strict';
import test from 'node:test';

import {
  agentIntro,
  agentSessionReducer,
  initialAgentSessionState,
  type AgentSessionAction,
  type AgentSessionState,
} from './agent-session.ts';
import type { AgentProjectContext } from './workspace-api.ts';
import type { AgentTurnResult } from './agent-api.ts';

const remoteContext: AgentProjectContext = {
  projectTitle: '示例 · 快递员的最后一单',
  contextLabel: '示例 · 快递员的最后一单 · 第 3 集 · 场 3',
  targetLabel: 'EP03 · 场 3 · 第 17 镜',
  evidence: '24 个镜头 · 不肯开门的人 · 苏婉家·旧楼门口',
  shotCount: 24,
  sceneLabel: '苏婉家·旧楼门口',
};

function run(
  actions: ReadonlyArray<AgentSessionAction>,
  initial: AgentSessionState = initialAgentSessionState,
): AgentSessionState {
  return actions.reduce(agentSessionReducer, initial);
}

test('agent copy follows the selected mode', () => {
  assert.match(agentIntro('chat'), /24 镜/);
  assert.match(agentIntro('create'), /能拍的镜头/);
  assert.match(
    agentIntro('chat', { ...remoteContext, shotCount: 0 }),
    /还没有分镜/,
  );
});

test('quick prompt fills the existing draft without sending', () => {
  const state = run([{ type: 'draft', value: '收紧第 3 集钩子' }]);

  assert.equal(state.draft, '收紧第 3 集钩子');
  assert.equal(state.phase, 'idle');
  assert.equal(state.submittedPrompt, undefined);
});

test('submitting trims the draft and enters a single working turn', () => {
  const state = run([
    { type: 'draft', value: '  收紧第 3 集钩子  ' },
    { type: 'submit' },
    { type: 'draft', value: '第二条' },
    { type: 'submit' },
  ]);

  assert.equal(state.phase, 'working');
  assert.equal(state.submittedPrompt, '收紧第 3 集钩子');
  assert.deepEqual(state.toolSteps, [
    '读取当前项目镜头',
    '比对角色锚点与视觉宪法',
    '检查当前镜首帧缺口',
  ]);
});

test('blank or whitespace-only input cannot start a turn', () => {
  const state = run([
    { type: 'draft', value: '   ' },
    { type: 'submit' },
  ]);

  assert.equal(state.phase, 'idle');
  assert.equal(state.submittedPrompt, undefined);
});

test('stopping preserves the request and does not create a proposal', () => {
  const state = run([
    { type: 'draft', value: '这句台词是不是太重' },
    { type: 'submit' },
    { type: 'stop' },
    { type: 'complete' },
  ]);

  assert.equal(state.phase, 'stopped');
  assert.equal(state.submittedPrompt, '这句台词是不是太重');
  assert.equal(state.proposal, undefined);
});

test('completion creates one proposal with evidence, impact and cost', () => {
  const state = run([
    { type: 'draft', value: '收紧第 3 集钩子' },
    { type: 'submit' },
    { type: 'complete' },
  ]);

  assert.equal(state.phase, 'proposed');
  assert.equal(state.draft, '');
  assert.equal(state.proposal?.target, 'EP03 · 场 12 · 第 17 镜');
  assert.match(state.proposal?.evidence ?? '', /24 个镜头/);
  assert.match(state.proposal?.impact ?? '', /影响当前位置前后镜头/);
  assert.match(state.proposal?.cost ?? '', /¥0\.42/);
});

test('accept only applies to a completed proposal and exposes the review route', () => {
  const early = run([
    { type: 'draft', value: '补一场雨夜冲突' },
    { type: 'submit' },
    { type: 'accept' },
  ]);
  assert.equal(early.phase, 'working');

  const applied = run(
    [
      { type: 'complete' },
      { type: 'accept' },
    ],
    early,
  );

  assert.equal(applied.phase, 'applied');
  assert.equal(applied.reviewRoute, '/review/shot-17');
});

test('dismissing a proposal returns to idle and clears the completed turn', () => {
  const state = run([
    { type: 'draft', value: '换一个更冷的开场' },
    { type: 'submit' },
    { type: 'complete' },
    { type: 'dismiss' },
  ]);

  assert.equal(state.phase, 'idle');
  assert.equal(state.draft, '');
  assert.equal(state.submittedPrompt, undefined);
  assert.equal(state.proposal, undefined);
});

test('mode changes update new prompts without rewriting an in-flight request', () => {
  const state = run([
    { type: 'draft', value: '补一场雨夜冲突' },
    { type: 'mode', mode: 'create' },
    { type: 'submit' },
    { type: 'mode', mode: 'chat' },
    { type: 'complete' },
  ]);

  assert.equal(state.mode, 'chat');
  assert.equal(state.submittedPrompt, '补一场雨夜冲突');
  assert.equal(state.phase, 'proposed');
  assert.equal(state.proposal?.title, '先补一个不解释的动作');
});

test('a submitted turn keeps its remote project context through completion', () => {
  const state = run([
    { type: 'draft', value: '收紧这一场的钩子' },
    { type: 'submit', context: remoteContext },
    { type: 'complete' },
  ]);

  assert.equal(state.phase, 'proposed');
  assert.equal(state.projectContext?.projectTitle, '示例 · 快递员的最后一单');
  assert.equal(state.proposal?.target, 'EP03 · 场 3 · 第 17 镜');
  assert.match(state.proposal?.evidence ?? '', /苏婉家·旧楼门口/);
  assert.match(agentIntro('chat', state.projectContext), /旧楼门口/);
});

test('a real Agent response replaces the local proposal with reply and tool trace', () => {
  const result: AgentTurnResult = {
    reply: '第 1 镜缺陈默的参考图。',
    toolNames: ['audit_shots'],
    modelCalls: 2,
    degraded: false,
  };
  const state = run([
    { type: 'draft', value: '检查分镜缺什么' },
    { type: 'submit', context: remoteContext },
    { type: 'complete', result },
  ]);

  assert.equal(state.phase, 'proposed');
  assert.equal(state.reply, result.reply);
  assert.deepEqual(state.toolNames, ['audit_shots']);
  assert.equal(state.modelCalls, 2);
  assert.equal(state.proposal, undefined);
});

test('Agent failures preserve the prompt and allow retry', () => {
  const failed = run([
    { type: 'draft', value: '检查这一场' },
    { type: 'submit', context: remoteContext },
    { type: 'fail', message: '额度已用完' },
  ]);

  assert.equal(failed.phase, 'error');
  assert.equal(failed.error, '额度已用完');
  assert.equal(failed.draft, '检查这一场');

  const retry = agentSessionReducer(failed, { type: 'submit', context: remoteContext });
  assert.equal(retry.phase, 'working');
  assert.equal(retry.error, undefined);
});

test('confirmed shot edits move through writing, success and conflict retry', () => {
  const result: AgentTurnResult = {
    reply: '建议先停一拍。',
    toolNames: ['propose_shot_edit'],
    modelCalls: 1,
    degraded: false,
    baseShotsSnapshotId: 'snapshot-1',
    shotEdit: {
      shot: 1,
      target: 'action',
      text: '陈默停步。',
      summary: '先停一拍',
    },
    proposal: {
      title: '第 1 镜 · 先停一拍',
      summary: '建议先停一拍。',
      target: 'EP01 · 场 1 · 第 1 镜',
      evidence: '1 个镜头',
      impact: '仅改第 1 镜动作',
      cost: '1 单位',
    },
  };
  const proposed = run([
    { type: 'draft', value: '让陈默先停一下' },
    { type: 'submit', context: remoteContext },
    { type: 'complete', result },
  ]);

  const applying = agentSessionReducer(proposed, { type: 'start-apply' });
  assert.equal(applying.phase, 'applying');
  assert.equal(applying.reviewShotNumber, 1);

  const conflict = agentSessionReducer(applying, {
    type: 'apply-fail',
    message: '分镜已在 Web 更新',
  });
  assert.equal(conflict.phase, 'apply-error');
  assert.equal(conflict.error, '分镜已在 Web 更新');
  assert.equal(conflict.shotEdit?.shot, 1);

  const retry = agentSessionReducer(conflict, { type: 'start-apply' });
  const applied = agentSessionReducer(retry, {
    type: 'apply-success',
    version: 3,
  });
  assert.equal(applied.phase, 'applied');
  assert.equal(applied.appliedVersion, 3);
  assert.equal(applied.reviewShotNumber, 1);
  assert.equal(applied.error, undefined);
});
