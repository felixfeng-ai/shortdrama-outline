import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('任务页只渲染工作区真实任务，不退回静态演示队列', () => {
  const source = fs.readFileSync('app/(tabs)/tasks.tsx', 'utf8');

  assert.ok(source.includes('data.tasks'), '任务页没有读取移动上下文的真实任务');
  assert.ok(source.includes('taskStatusLabel'), '任务页没有使用统一状态文案');
  assert.ok(source.includes('safeTaskError'), '任务页没有脱敏失败原因');
  assert.ok(!source.includes('GENERATION_TASKS'), '任务页仍在读取静态演示任务');
  assert.ok(!source.includes('REVIEW_VERSIONS'), '任务页仍混入静态审片版本');
});
