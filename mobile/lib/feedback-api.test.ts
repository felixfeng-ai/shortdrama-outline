import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchMobileFeedback,
  submitMobileFeedback,
} from './feedback-api.ts';

const feedback = {
  id: 'feedback_1',
  category: 'voice',
  body: '语音没有启动。',
  appVersion: '1.1.0',
  buildVersion: '12',
  platform: 'android',
  osVersion: '36',
  deviceModel: 'Redmi',
  screen: '/',
  status: 'open',
  createdAt: 1,
};

test('App 提交反馈带账号凭据和设备上下文', async () => {
  let body: Record<string, unknown> | undefined;
  let init: RequestInit | undefined;
  const fakeFetch = async (_input: string | URL | Request, options?: RequestInit) => {
    init = options;
    body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    return Response.json({
      success: true,
      error: null,
      data: { feedback },
    });
  };

  const result = await submitMobileFeedback(
    'http://127.0.0.1:3200',
    {
      category: 'voice',
      body: '语音没有启动。',
      appVersion: '1.1.0',
      buildVersion: '12',
      platform: 'android',
      osVersion: '36',
      deviceModel: 'Redmi',
      screen: '/',
    },
    fakeFetch as typeof fetch,
  );

  assert.equal(init?.method, 'POST');
  assert.equal(init?.credentials, 'include');
  assert.equal(body?.body, '语音没有启动。');
  assert.equal(result.id, 'feedback_1');
});

test('App 读取当前账号提交过的内测反馈', async () => {
  let url = '';
  const fakeFetch = async (input: string | URL | Request) => {
    url = String(input);
    return Response.json({
      success: true,
      error: null,
      data: { feedback: [feedback] },
    });
  };

  const result = await fetchMobileFeedback(
    'http://127.0.0.1:3200',
    fakeFetch as typeof fetch,
  );

  assert.equal(url, 'http://127.0.0.1:3200/api/mobile/feedback');
  assert.equal(result[0].status, 'open');
});
