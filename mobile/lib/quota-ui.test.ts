import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('我的页使用服务端集数额度解释并移除固定完整项目口径', () => {
  const me = fs.readFileSync('app/(tabs)/me.tsx', 'utf8');

  assert.match(me, /quotaProjectLabel/);
  assert.match(me, /quotaCostLabel/);
  assert.match(me, /quotaPresetRows/);
  assert.match(me, /quotaPriceVersionLabel/);
  assert.match(me, /集数预设/);
  assert.match(me, /当前项目/);
  assert.doesNotMatch(me, /个完整项目/);
});
