import assert from 'node:assert/strict';
import test from 'node:test';

import {
  voiceAvailabilityMessage,
  voiceErrorMessage,
} from './voice-errors.ts';

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
  assert.equal(message, null);
});

test('语音服务不可用和清单为空时给出具体系统原因', () => {
  assert.match(
    voiceAvailabilityMessage({
      available: false,
      platform: 'android',
      services: [],
    }) ?? '',
    /语音识别服务/,
  );
  assert.match(
    voiceAvailabilityMessage({
      available: true,
      platform: 'android',
      services: [],
    }) ?? '',
    /未安装|未启用/,
  );
  assert.equal(
    voiceAvailabilityMessage({
      available: true,
      platform: 'android',
      services: ['com.google.android.googlequicksearchbox'],
    }),
    null,
  );
  assert.equal(
    voiceAvailabilityMessage({
      available: true,
      platform: 'ios',
      services: [],
    }),
    null,
  );
});

test('client 错误不再落回泛化启动失败', () => {
  const message = voiceErrorMessage('client', 'SpeechRecognizer client error', 5);
  assert.match(message ?? '', /系统语音服务/);
  assert.ok(!message?.includes('SpeechRecognizer'));
});
