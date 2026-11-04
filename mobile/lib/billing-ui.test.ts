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
