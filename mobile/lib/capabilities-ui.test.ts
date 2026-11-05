import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('首页提供不占正文高度的“能做什么”入口', () => {
  const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  assert.match(home, /router\.push\('\/capabilities'\)/);
  assert.match(home, /能做什么/);
});

test('能力地图覆盖现有真实创作、审片和检查入口', () => {
  const page = fs.readFileSync('app/capabilities.tsx', 'utf8');
  for (const route of [
    '/generate',
    '/generate?mode=video',
    '/draft',
    '/tasks',
    '/continuity',
    '/pacing',
    '/overseas',
    '/projects',
  ]) {
    assert.ok(page.includes(route), `能力地图缺少 ${route}`);
  }
  assert.match(page, /videoReadiness/);
  assert.match(page, /首帧/);
});
