import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('平板可安装且主要页面使用最大内容宽度', () => {
  const config = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
  assert.equal(config.ios.supportsTablet, true);
  assert.equal(config.orientation, 'default');
  const agent = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  const tasks = fs.readFileSync('app/(tabs)/tasks.tsx', 'utf8');
  assert.ok(agent.includes('maxWidth: 760'));
  assert.ok(tasks.includes('maxWidth: 760'));
});

test('根布局挂载跨页面任务恢复桥', () => {
  const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
  assert.ok(layout.includes('TaskRecoveryBridge'));
});
