import assert from 'node:assert/strict';
import test from 'node:test';

import { base64FromDataUrl } from './media-encoding-core.ts';

test('Web 参考图 Data URL 只提取真实 base64 内容', () => {
  assert.equal(
    base64FromDataUrl('data:image/png;base64,iVBORw0KGgo='),
    'iVBORw0KGgo=',
  );
});

test('损坏或空的 Data URL 不会提交伪参考图', () => {
  assert.throws(() => base64FromDataUrl('https://example.com/a.png'), /读取失败/);
  assert.throws(() => base64FromDataUrl('data:image/png;base64,'), /没有可读取/);
});
