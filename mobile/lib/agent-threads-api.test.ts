import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendAgentThreadTurn,
  loadRemoteAgentSession,
} from './agent-threads-api.ts';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: status < 400, data, error: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Agent 会话从服务端恢复最近一轮 User/Assistant 对话', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/threads')) {
      return json({
        threads: [{
          id: 'thread-1',
          projectId: 'project-1',
          ownerId: 'owner-1',
          title: '第 3 集钩子',
          messageCount: 2,
          createdAt: 10,
          updatedAt: 20,
        }],
      });
    }
    if (url.endsWith('/threads/thread-1')) {
      return json({
        thread: {
          id: 'thread-1',
          projectId: 'project-1',
          ownerId: 'owner-1',
          title: '第 3 集钩子',
          messageCount: 2,
          createdAt: 10,
          updatedAt: 20,
          messages: [
            { id: 'm1', threadId: 'thread-1', role: 'user', content: '帮我收紧第 3 集钩子', createdAt: 11 },
            { id: 'm2', threadId: 'thread-1', role: 'assistant', content: '把车票留到门缝。', createdAt: 12 },
          ],
        },
      });
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;

  const session = await loadRemoteAgentSession(
    'http://127.0.0.1:3200',
    'project-1',
    fetchImpl,
  );

  assert.equal(session?.remoteThreadId, 'thread-1');
  assert.equal(session?.submittedPrompt, '帮我收紧第 3 集钩子');
  assert.equal(session?.reply, '把车票留到门缝。');
  assert.equal(session?.phase, 'proposed');
  assert.equal(calls.length, 2);
});

test('首次跨设备消息创建线程，后续消息写入同一线程', async () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  let threadId = '';
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: String(init?.body ?? '') });
    if (url.endsWith('/threads') && method === 'POST') {
      return json({
        thread: {
          id: 'thread-new',
          projectId: 'project-1',
          ownerId: 'owner-1',
          title: '帮助我规划视频',
          messageCount: 0,
          createdAt: 10,
          updatedAt: 10,
        },
      });
    }
    if (url.endsWith('/threads/thread-new/messages')) {
      threadId = 'thread-new';
      return json({
        message: {
          id: `message-${calls.length}`,
          threadId: 'thread-new',
          role: JSON.parse(String(init?.body)).role,
          content: JSON.parse(String(init?.body)).content,
          createdAt: 20 + calls.length,
        },
      });
    }
    throw new Error(`unexpected ${method} ${url}`);
  }) as typeof fetch;

  const firstThreadId = await appendAgentThreadTurn(
    'http://127.0.0.1:3200',
    'project-1',
    null,
    [
      { role: 'user', content: '帮助我规划视频' },
      { role: 'assistant', content: '先确认每镜 5 秒和预算。' },
    ],
    fetchImpl,
  );
  const secondThreadId = await appendAgentThreadTurn(
    'http://127.0.0.1:3200',
    'project-1',
    firstThreadId,
    [{ role: 'user', content: '把预算压到 3 元' }],
    fetchImpl,
  );

  assert.equal(firstThreadId, 'thread-new');
  assert.equal(secondThreadId, 'thread-new');
  assert.equal(threadId, 'thread-new');
  assert.equal(calls.filter((call) => call.method === 'POST').length, 4);
  assert.match(calls[1].body, /"role":"user"/);
  assert.match(calls[2].body, /"role":"assistant"/);
});
