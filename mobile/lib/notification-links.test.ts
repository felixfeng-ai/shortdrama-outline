import assert from 'node:assert/strict';
import test from 'node:test';

import { notificationRoute, pushPlatform } from './notification-links.ts';

test('成功通知优先进入真实审片页', () => {
  assert.deepEqual(notificationRoute({
    projectId: 'p1',
    assetId: 'asset-1',
    targetType: 'shot',
    targetId: 'shot-1',
    targetLabel: '第 1 集 · 第 1 镜',
  }), {
    pathname: '/review/[id]',
    params: {
      id: 'asset-1',
      projectId: 'p1',
      targetType: 'shot',
      targetId: 'shot-1',
      targetLabel: '第 1 集 · 第 1 镜',
    },
  });
});

test('失败通知或缺少资产时进入任务页', () => {
  assert.deepEqual(notificationRoute({ projectId: 'p1' }), { pathname: '/tasks', params: { projectId: 'p1' } });
});

test('设备平台只接受 iOS 与 Android', () => {
  assert.equal(pushPlatform('ios'), 'ios');
  assert.equal(pushPlatform('android'), 'android');
  assert.equal(pushPlatform('web'), 'unknown');
});
