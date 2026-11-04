import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchWithRetry } from './network.ts';

test('GET 网络失败会有限重试并最终成功', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    if (calls < 3) throw new Error('offline');
    return Response.json({ ok: true });
  };
  const response = await fetchWithRetry('http://example.test', {
    method: 'GET',
  }, {
    fetchImpl: fakeFetch as typeof fetch,
    retries: 2,
    delay: () => Promise.resolve(),
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
});

test('写请求不会自动重试', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    throw new Error('offline');
  };
  await assert.rejects(() => fetchWithRetry('http://example.test', {
    method: 'POST',
  }, {
    fetchImpl: fakeFetch as typeof fetch,
    retries: 3,
    delay: () => Promise.resolve(),
  }));
  assert.equal(calls, 1);
});

test('5xx GET 可重试，4xx 不重试', async () => {
  let calls = 0;
  const serverError = async () => {
    calls += 1;
    return new Response('error', { status: 503 });
  };
  const response = await fetchWithRetry('http://example.test', {
  }, {
    fetchImpl: serverError as typeof fetch,
    retries: 1,
    delay: () => Promise.resolve(),
  });
  assert.equal(response.status, 503);
  assert.equal(calls, 2);

  let forbiddenCalls = 0;
  const forbidden = async () => {
    forbiddenCalls += 1;
    return new Response('forbidden', { status: 403 });
  };
  await fetchWithRetry('http://example.test', {
  }, {
    fetchImpl: forbidden as typeof fetch,
    retries: 2,
    delay: () => Promise.resolve(),
  });
  assert.equal(forbiddenCalls, 1);
});
