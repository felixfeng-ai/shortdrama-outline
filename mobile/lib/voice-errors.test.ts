import assert from 'node:assert/strict';
import test from 'node:test';

import { voiceErrorMessage } from './voice-errors.ts';

test('abort 是控制流，不进入红色错误提示', () => {
  assert.equal(voiceErrorMessage('aborted', 'Speech recognition aborted'), null);
});

test('无语音、权限、网络和服务错误映射为可恢复中文', () => {
  assert.match(voiceErrorMessage('no-speech', 'No speech') ?? '', /没有听到/);
  assert.match(voiceErrorMessage('not-allowed', 'not allowed') ?? '', /系统设置/);
  assert.match(voiceErrorMessage('network', 'network') ?? '', /网络/);
  assert.match(voiceErrorMessage('service-not-allowed', 'service') ?? '', /语音识别服务/);
});

test('未知错误也不直接输出底层英文 message', () => {
  const message = voiceErrorMessage('unknown', 'Speech recognition aborted');
  assert.equal(message, '语音识别没有启动，请稍后重试');
  assert.ok(!message?.includes('Speech'));
});
