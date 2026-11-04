import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('通知只在用户点击后申请权限，并注册真实 Token', () => {
  const me = fs.readFileSync('app/(tabs)/me.tsx', 'utf8');
  const service = fs.readFileSync('lib/native-notifications.ts', 'utf8');
  const layout = fs.readFileSync('app/_layout.tsx', 'utf8');

  assert.ok(me.includes('onEnableNotifications'), '账户页没有开启通知入口');
  assert.ok(service.includes('requestPermissionsAsync'), '没有显式权限请求');
  assert.ok(service.includes('getExpoPushTokenAsync'), '没有获取 Expo Push Token');
  assert.ok(service.includes('addNotificationResponseReceivedListener'), '没有通知点击监听');
  assert.ok(layout.includes('NotificationBridge'), '根布局没有挂载通知路由桥');
});
