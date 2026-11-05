import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('语音监听不依赖每次渲染变化的 onChangeText 回调', () => {
  const source = fs.readFileSync('components/agent-composer.tsx', 'utf8');
  assert.match(source, /onChangeTextRef/);
  assert.match(source, /voiceErrorMessage/);
  assert.match(source, /正在准备麦克风/);
  assert.doesNotMatch(
    source,
    /addListener\('error',[\s\S]{0,240}setMediaError\(event\.message/,
  );
});
