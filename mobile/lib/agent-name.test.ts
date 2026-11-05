import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appFiles = [
  'components/agent-turn.tsx',
  'components/agent-composer.tsx',
  'app/(tabs)/index.tsx',
  'lib/agent-api.ts',
  'DESIGN.md',
  'README.md',
] as const;

test('App user-facing Agent copy uses Veya Agent instead of AI 场记', () => {
  for (const file of appFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(source.includes('Veya Agent'), `${file} 缺少 Veya Agent 名称`);
    assert.ok(!source.includes('AI 场记'), `${file} 仍包含旧名称 AI 场记`);
  }
});

test('mobile Agent prompt and fallback use the same Veya Agent identity', () => {
  const system = fs.readFileSync('../lib/agent/system.ts', 'utf8');
  const mobileRoute = fs.readFileSync('../app/api/mobile/agent/route.ts', 'utf8');

  assert.match(system, /Veya Agent/);
  assert.ok(!system.includes('AI 场记'), '系统提示词仍包含旧名称 AI 场记');
  assert.match(mobileRoute, /Veya Agent/);
  assert.ok(!mobileRoute.includes('AI 场记'), '移动 Agent 路由仍包含旧名称 AI 场记');
});
