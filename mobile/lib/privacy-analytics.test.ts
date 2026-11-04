import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sanitizeAnalyticsEvent,
  shouldRetryAnalytics,
} from './privacy-analytics.ts';

test('分析事件只保留白名单属性', () => {
  const event = sanitizeAnalyticsEvent({
    name: 'screen_view',
    path: '/tasks',
    properties: {
      durationMs: 123,
      projectTitle: '不应该采集',
      prompt: '剧本文本',
      result: 'success',
    },
  });
  assert.deepEqual(event, {
    name: 'screen_view',
    path: '/tasks',
    properties: { durationMs: 123, result: 'success' },
  });
});

test('分析请求只对网络和服务端错误做有限重试', () => {
  assert.equal(shouldRetryAnalytics(1, true), true);
  assert.equal(shouldRetryAnalytics(3, true), false);
  assert.equal(shouldRetryAnalytics(1, false), false);
});
