import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('根布局在首次启动前挂载引导门禁并注册引导页', () => {
  const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
  assert.match(layout, /OnboardingProvider/);
  assert.match(layout, /OnboardingBootstrap/);
  assert.match(layout, /name="onboarding"/);
});

test('引导页说明 Veya Agent 价值并提供示例、直接开始和跳过', () => {
  const screen = fs.readFileSync('app/onboarding.tsx', 'utf8');
  assert.match(screen, /Veya Agent/);
  assert.match(screen, /把一场戏/);
  assert.match(screen, /用示例剧体验/);
  assert.match(screen, /直接开始/);
  assert.match(screen, /跳过/);
  assert.match(screen, /SceneFrame/);
  assert.ok(!screen.includes('AI 场记'));
});

test('引导操作写入完成标记后才离开当前页', () => {
  const screen = fs.readFileSync('app/onboarding.tsx', 'utf8');
  assert.match(screen, /completeOnboarding/);
  assert.match(screen, /router\.replace\('\/demo'\)/);
  assert.match(screen, /router\.replace\('\/projects'\)/);
  assert.match(screen, /router\.replace\('\/'\)/);
});
