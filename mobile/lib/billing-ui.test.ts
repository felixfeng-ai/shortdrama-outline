import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('订阅页使用平台内购、恢复购买和服务端核验', () => {
  const billing = fs.readFileSync('components/billing-screen.native.tsx', 'utf8');
  assert.ok(billing.includes("from 'expo-iap'"), '未使用平台内购模块');
  assert.ok(billing.includes('requestPurchase'), '没有购买入口');
  assert.ok(billing.includes('getAvailablePurchases'), '没有恢复购买');
  assert.ok(billing.includes('submitBillingPurchase'), '没有提交服务端核验');
});

test('订阅核验成功后刷新工作区额度', () => {
  const billing = fs.readFileSync('components/billing-screen.native.tsx', 'utf8');
  assert.ok(billing.includes("from '@/lib/workspace-store'"), '订阅页没有连接工作区');
  assert.ok(billing.includes('useWorkspace()'), '订阅页没有读取工作区刷新方法');
  assert.ok(
    /if \(result\.verified\) \{[\s\S]{0,160}refreshWorkspace\(\)/.test(billing),
    '核验通过后没有刷新账户额度',
  );
});
