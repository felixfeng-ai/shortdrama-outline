import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAgentSuggestion,
  mapAgentResponse,
  runAgentTurn,
  toolLabel,
  type MobileAgentResponse,
} from './agent-api.ts';
import type { AgentProjectContext } from './workspace-api.ts';

const context: AgentProjectContext = {
  projectTitle: '快递员',
  contextLabel: '快递员 · 第 1 集 · 场 1',
  targetLabel: 'EP01 · 场 1 · 第 1 镜',
  evidence: '24 个镜头 · 第 1 集',
  shotCount: 24,
  sceneLabel: '别墅门外',
};

const response: MobileAgentResponse = {
  reply: '第 1 镜缺陈默的参考图。',
  toolNames: ['audit_shots'],
  cards: [],
  modelCalls: 2,
  degraded: false,
  baseShotsSnapshotId: 'snapshot-1',
};

test('mobile agent request posts the current project and prompt with credentials', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    init = options;
    return new Response(JSON.stringify({ success: true, error: null, data: response }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await runAgentTurn(
    'http://127.0.0.1:3200/',
    { projectId: 'p1', prompt: '检查第 1 镜' },
    fakeFetch as typeof fetch,
  );

  assert.equal(url, 'http://127.0.0.1:3200/api/mobile/agent');
  assert.equal(init?.method, 'POST');
  assert.equal(init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(init?.body)), {
    projectId: 'p1',
    prompt: '检查第 1 镜',
  });
  assert.equal(result.reply, response.reply);
});

test('agent request surfaces API errors and preserves AbortError', async () => {
  const errorFetch = async () =>
    new Response(JSON.stringify({ success: false, data: null, error: '额度已用完' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  await assert.rejects(
    () => runAgentTurn('http://127.0.0.1:3200', { projectId: 'p1', prompt: '检查' }, errorFetch as typeof fetch),
    /额度已用完/,
  );

  const abortFetch = async () => {
    throw new DOMException('cancelled', 'AbortError');
  };
  await assert.rejects(
    () => runAgentTurn('http://127.0.0.1:3200', { projectId: 'p1', prompt: '检查' }, abortFetch as typeof fetch),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
});

test('agent request rejects missing base URL, network failures and malformed bodies', async () => {
  await assert.rejects(
    () => runAgentTurn('', { projectId: 'p1', prompt: '检查' }),
    /尚未配置/,
  );

  const networkFailure = async () => {
    throw new Error('offline');
  };
  await assert.rejects(
    () =>
      runAgentTurn(
        'http://127.0.0.1:3200',
        { projectId: 'p1', prompt: '检查' },
        networkFailure as typeof fetch,
      ),
    /无法连接/,
  );

  const brokenBody = async () => new Response('<html>', { status: 200 });
  await assert.rejects(
    () =>
      runAgentTurn(
        'http://127.0.0.1:3200',
        { projectId: 'p1', prompt: '检查' },
        brokenBody as typeof fetch,
      ),
    /无法识别/,
  );

  const missingReply = async () =>
    new Response(JSON.stringify({ success: true, error: null, data: { toolNames: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  await assert.rejects(
    () =>
      runAgentTurn(
        'http://127.0.0.1:3200',
        { projectId: 'p1', prompt: '检查' },
        missingReply as typeof fetch,
      ),
    /没有返回回答/,
  );
});

test('tool labels fall back to the raw server tool name', () => {
  assert.equal(toolLabel('audit_shots'), '分镜');
  assert.equal(toolLabel('future_tool'), 'future_tool');
});

test('shot edit responses map to one pending proposal without claiming a write', () => {
  const result = mapAgentResponse(
    {
      ...response,
      cards: [
        {
          kind: 'shot-edit',
          shot: 1,
          target: 'action',
          text: '陈默停步。',
          summary: '先停一拍',
        },
      ],
    },
    context,
  );

  assert.equal(result.proposal?.title, '第 1 镜 · 先停一拍');
  assert.match(result.proposal?.impact ?? '', /尚未写入/);
  assert.equal(result.proposal?.cost, '2 单位');
  assert.equal(result.baseShotsSnapshotId, 'snapshot-1');
  assert.deepEqual(result.shotEdit, {
    shot: 1,
    target: 'action',
    text: '陈默停步。',
    summary: '先停一拍',
  });
});

test('regenerate responses map the step label and reason', () => {
  const result = mapAgentResponse(
    {
      ...response,
      cards: [
        {
          kind: 'regenerate',
          step: 'episodes',
          stepLabel: '分集剧情',
          reason: '钩子强度几乎是一条平线',
        },
      ],
    },
    context,
  );

  assert.equal(result.proposal?.title, '建议重跑分集剧情');
  assert.match(result.proposal?.impact ?? '', /平线/);
});

test('confirmed shot edits post the base snapshot with credentials', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    init = options;
    return new Response(
      JSON.stringify({
        success: true,
        error: null,
        data: { snapshotId: 'snapshot-2', version: 2, shot: 1 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const result = await applyAgentSuggestion(
    'http://127.0.0.1:3200/',
    {
      projectId: 'p1',
      baseSnapshotId: 'snapshot-1',
      edit: { shot: 1, target: 'action', text: '陈默停步。', summary: '先停一拍' },
    },
    fakeFetch as typeof fetch,
  );

  assert.equal(url, 'http://127.0.0.1:3200/api/mobile/agent/apply');
  assert.equal(init?.method, 'POST');
  assert.equal(init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(init?.body)), {
    projectId: 'p1',
    baseSnapshotId: 'snapshot-1',
    edit: { shot: 1, target: 'action', text: '陈默停步。', summary: '先停一拍' },
  });
  assert.equal(result.version, 2);
});
