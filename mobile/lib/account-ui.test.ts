import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('账户页接入设备、导出与注销页面', () => {
  const me = fs.readFileSync('app/(tabs)/me.tsx', 'utf8');
  const sessions = fs.readFileSync('app/account/sessions.tsx', 'utf8');
  const data = fs.readFileSync('app/account/data.tsx', 'utf8');
  assert.ok(me.includes('/account/sessions'), '我的页没有设备入口');
  assert.ok(me.includes('/account/data'), '我的页没有数据入口');
  assert.ok(sessions.includes('revokeAccountSession'), '设备页不能下线会话');
  assert.ok(data.includes('exportAccount'), '数据页不能导出');
  assert.ok(data.includes('deleteAccount'), '数据页不能注销');
});

test('项目页接入重命名和删除确认', () => {
  const projects = fs.readFileSync('app/(tabs)/projects.tsx', 'utf8');
  assert.ok(projects.includes('renameProject'), '项目页没有重命名入口');
  assert.ok(projects.includes('deleteProject'), '项目页没有删除入口');
  assert.ok(projects.includes('Alert.alert'), '删除项目没有二次确认');
});
