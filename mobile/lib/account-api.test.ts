import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteAccount,
  exportAccount,
  fetchAccountSessions,
  revokeAccountSession,
} from './account-api.ts';

test('账号设备会话读取与下线使用 App 凭据', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (init?.method === 'DELETE') {
      return Response.json({ success: true, error: null, data: { revoked: true } });
    }
    return Response.json({
      success: true,
      error: null,
      data: {
        sessions: [{
          id: 'session-1',
          client: 'app',
          deviceName: 'iPhone',
          createdAt: 100,
          lastSeenAt: 200,
          expiresAt: 300,
          current: true,
        }],
      },
    });
  };

  const sessions = await fetchAccountSessions('http://127.0.0.1:3200', fakeFetch as typeof fetch);
  assert.equal(sessions[0].deviceName, 'iPhone');
  await revokeAccountSession(
    'http://127.0.0.1:3200',
    'session-1',
    fakeFetch as typeof fetch,
  );
  assert.equal(calls[1].url, 'http://127.0.0.1:3200/api/auth/sessions');
  assert.equal(calls[1].init?.method, 'DELETE');
});

test('账号导出与注销调用真实账户接口', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    init = options;
    if (init?.method === 'DELETE') {
      return Response.json({ success: true, error: null, data: { deleted: true } });
    }
    return Response.json({ success: true, error: null, data: { version: 1 } });
  };

  const exported = await exportAccount('http://127.0.0.1:3200', fakeFetch as typeof fetch);
  assert.deepEqual(exported, { version: 1 });
  assert.equal(url, 'http://127.0.0.1:3200/api/account/export');
  await deleteAccount('http://127.0.0.1:3200', fakeFetch as typeof fetch);
  assert.equal(init?.method, 'DELETE');
  assert.deepEqual(JSON.parse(String(init?.body)), { confirm: 'DELETE' });
});
