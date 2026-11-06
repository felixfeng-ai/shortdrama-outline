import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildDiagnosticEvent,
  sanitizeDiagnosticText,
} from './diagnostic-event.ts';

test('崩溃消息移除链接、Token、邮箱、绝对路径和提示词边界', () => {
  const text = sanitizeDiagnosticText(
    'TypeError at C:\\Project\\secret\\script.ts https://chenju.work/x '
    + 'Bearer abcdefghijklmnop user@example.com sk-secretsecretsecret prompt=雨夜追杀',
  );

  assert.ok(!text.includes('C:\\Project'));
  assert.ok(!text.includes('https://'));
  assert.ok(!text.includes('abcdefghijklmnop'));
  assert.ok(!text.includes('user@example.com'));
  assert.ok(!text.includes('sk-secret'));
  assert.ok(text.length <= 180);
});

test('诊断事件只保留版本、设备和脱敏错误字段', () => {
  const event = buildDiagnosticEvent({
    errorName: 'TypeError',
    errorCode: 5,
    message: 'SpeechRecognizer failed https://example.com Bearer abcdefghijklmnop',
    path: '/review/shot-1',
    appVersion: '1.1.0',
    buildVersion: '12',
    platform: 'android',
    osVersion: '36',
    deviceModel: 'Redmi',
  });

  assert.equal(event.name, 'app_error');
  assert.equal(event.path, '/review/shot-1');
  assert.deepEqual(event.properties, {
    errorName: 'TypeError',
    errorCode: 5,
    result: 'SpeechRecognizer failed [链接] [令牌]',
    appVersion: '1.1.0',
    buildVersion: '12',
    platform: 'android',
    osVersion: '36',
    deviceModel: 'Redmi',
  });
});

test('仅内测构建排队并在可用网络上报诊断', () => {
  const service = fs.readFileSync('lib/diagnostics-service.ts', 'utf8');
  const boundary = fs.readFileSync('components/app-error-boundary.tsx', 'utf8');
  const bridge = fs.readFileSync('components/analytics-bridge.tsx', 'utf8');

  assert.match(service, /EXPO_PUBLIC_INTERNAL_DIAGNOSTICS/);
  assert.match(service, /flushDiagnostics/);
  assert.match(boundary, /reportDiagnostic/);
  assert.match(bridge, /flushDiagnostics/);
});
