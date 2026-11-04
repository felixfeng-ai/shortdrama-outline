import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerPushToken,
  removePushToken,
  type PushTokenPayload,
} from './push-token-api.ts';

const token: PushTokenPayload = {
  token: 'ExponentPushToken[test-token]',
  platform: 'ios',
  deviceName: 'iPhone',
};

test('注册原生推送 Token 使用 App 凭据', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    init = options;
    return Response.json({ success: true, error: null, data: { id: 'push-1' } });
  };

  await registerPushToken('http://127.0.0.1:3200/', token, fakeFetch as typeof fetch);
  assert.equal(url, 'http://127.0.0.1:3200/api/mobile/push-token');
  assert.equal(init?.method, 'POST');
  assert.equal(init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(init?.body)), token);
});

test('关闭通知删除当前 Token', async () => {
  let init: RequestInit | undefined;
  const fakeFetch = async (_input: string | URL | Request, options?: RequestInit) => {
    init = options;
    return Response.json({ success: true, error: null, data: { removed: true } });
  };
  await removePushToken('http://127.0.0.1:3200', token.token, fakeFetch as typeof fetch);
  assert.equal(init?.method, 'DELETE');
  assert.deepEqual(JSON.parse(String(init?.body)), { token: token.token });
});
