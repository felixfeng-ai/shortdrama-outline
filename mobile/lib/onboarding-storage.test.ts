import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ONBOARDING_STORAGE_KEY,
  parseOnboardingCompletion,
  shouldRedirectToOnboarding,
} from './onboarding-state.ts';

test('首次启动没有完成标记时进入引导页', () => {
  assert.equal(parseOnboardingCompletion(null), false);
  assert.equal(shouldRedirectToOnboarding('pending', ['(tabs)']), true);
});

test('当前版本的完成标记能阻止重复展示', () => {
  const raw = JSON.stringify({
    version: 1,
    completed: true,
    completedAt: '2026-11-05T00:00:00.000Z',
  });
  assert.equal(parseOnboardingCompletion(raw), true);
  assert.equal(shouldRedirectToOnboarding('complete', ['(tabs)']), false);
});

test('损坏、旧版或未完成的标记都按未完成处理', () => {
  assert.equal(parseOnboardingCompletion('{broken'), false);
  assert.equal(parseOnboardingCompletion(JSON.stringify({ version: 0, completed: true })), false);
  assert.equal(parseOnboardingCompletion(JSON.stringify({ version: 1, completed: false })), false);
});

test('已在引导页或仍在读取状态时不重复跳转', () => {
  assert.equal(shouldRedirectToOnboarding('pending', ['onboarding']), false);
  assert.equal(shouldRedirectToOnboarding('loading', ['(tabs)']), false);
  assert.match(ONBOARDING_STORAGE_KEY, /onboarding/);
});
