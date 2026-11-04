import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchCurrentUser,
  logoutAuthSession,
  normalizeEmail,
  refreshAuthSession,
  requestEmailCode,
  verifyEmailCode,
} from './auth-api.ts';

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, data: status < 400 ? data : null, error: status < 400 ? null : data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('email normalization matches the web account form', () => {
  assert.equal(normalizeEmail('  Writer@Example.COM '), 'writer@example.com');
  assert.throws(() => normalizeEmail('not-an-email'), /邮箱/);
});

test('App requests the same email code endpoint as Web', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    init = options;
    return envelope({ expiresAt: 123, cooldownSeconds: 60, devCode: '123456' });
  };

  const result = await requestEmailCode(
    'http://127.0.0.1:3200/',
    'writer@example.com',
    fakeFetch as typeof fetch,
  );

  assert.equal(url, 'http://127.0.0.1:3200/api/auth/email/request-code');
  assert.equal(init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(init?.body)), { email: 'writer@example.com' });
  assert.equal(result.devCode, '123456');
});

test('App verification requests client=app and returns rotating credentials', async () => {
  let init: RequestInit | undefined;
  const fakeFetch = async (_input: string | URL | Request, options?: RequestInit) => {
    init = options;
    return envelope({
      user: {
        id: 'user_1',
        email: 'writer@example.com',
        phone: null,
        displayName: 'writer',
        createdAt: 1,
      },
      claimed: { projects: 2 },
      accessToken: 'cj1.access',
      accessExpiresAt: 123,
      refreshToken: 'refresh-1',
      expiresAt: 456,
    });
  };

  const result = await verifyEmailCode(
    'http://127.0.0.1:3200',
    'writer@example.com',
    '123456',
    'iPhone',
    fakeFetch as typeof fetch,
  );

  assert.deepEqual(JSON.parse(String(init?.body)), {
    email: 'writer@example.com',
    code: '123456',
    client: 'app',
    deviceName: 'iPhone',
  });
  assert.equal(result.user.id, 'user_1');
  assert.equal(result.accessToken, 'cj1.access');
  assert.equal(result.refreshToken, 'refresh-1');
  assert.deepEqual(result.claimed, { projects: 2 });
});

test('refresh rotates credentials and authenticated requests use Bearer access', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: options });
    if (url.endsWith('/api/auth/refresh')) {
      return envelope({
        user: { id: 'user_1', email: 'writer@example.com', phone: null, displayName: 'writer' },
        accessToken: 'cj1.next',
        accessExpiresAt: 999,
        refreshToken: 'refresh-2',
        refreshExpiresAt: 1000,
      });
    }
    return envelope({ user: { id: 'user_1', email: 'writer@example.com', phone: null, displayName: 'writer' } });
  };

  const refreshed = await refreshAuthSession(
    'http://127.0.0.1:3200',
    'refresh-1',
    fakeFetch as typeof fetch,
  );
  const user = await fetchCurrentUser(
    'http://127.0.0.1:3200',
    'cj1.next',
    fakeFetch as typeof fetch,
  );

  assert.equal(refreshed.refreshToken, 'refresh-2');
  assert.equal(user.email, 'writer@example.com');
  const authHeader = new Headers(calls[1].init?.headers).get('Authorization');
  assert.equal(authHeader, 'Bearer cj1.next');
});

test('logout revokes the current session with the Bearer access token', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    init = options;
    return envelope({ revoked: true });
  };

  await logoutAuthSession(
    'http://127.0.0.1:3200',
    'cj1.access',
    fakeFetch as typeof fetch,
  );

  assert.equal(url, 'http://127.0.0.1:3200/api/auth/logout');
  assert.equal(init?.method, 'POST');
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer cj1.access');
});
