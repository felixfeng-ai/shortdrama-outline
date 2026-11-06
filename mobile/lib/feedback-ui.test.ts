import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('我的页提供内测反馈入口和独立反馈页', () => {
  const me = fs.readFileSync('app/(tabs)/me.tsx', 'utf8');
  const feedback = fs.readFileSync('app/feedback.tsx', 'utf8');

  assert.ok(me.includes("router.push('/feedback')"));
  assert.ok(me.includes('内测反馈'));
  assert.ok(feedback.includes('submitMobileFeedback'));
  assert.ok(feedback.includes('当前页面'));
  assert.ok(feedback.includes('反馈编号'));
  assert.ok(feedback.includes('keyboardShouldPersistTaps'));
});
