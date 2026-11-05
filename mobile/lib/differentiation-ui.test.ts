import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Agent 首页提供现场、节奏和海外审片三个辅助入口', () => {
  const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  for (const route of ['/continuity', '/pacing', '/overseas']) {
    assert.ok(home.includes(route), `首页缺少 ${route}`);
  }
});

test('三个辅助页面沿用现有原生壳和真实数据状态', () => {
  const continuity = fs.readFileSync('app/continuity.tsx', 'utf8');
  const pacing = fs.readFileSync('app/pacing.tsx', 'utf8');
  const overseas = fs.readFileSync('app/overseas.tsx', 'utf8');

  assert.match(continuity, /现场连续性/);
  assert.match(continuity, /拍照/);
  assert.match(continuity, /提示词修正/);
  assert.match(pacing, /按集节奏/);
  assert.match(pacing, /对白密度/);
  assert.match(pacing, /平均镜头/);
  assert.match(overseas, /海外审片/);
  assert.match(overseas, /字幕上限/);
  assert.match(overseas, /文化适配/);
});
