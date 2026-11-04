import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchBillingProducts,
  submitBillingPurchase,
} from './billing-api.ts';

test('订阅商品从服务端配置读取', async () => {
  const fakeFetch = async () => Response.json({
    success: true,
    error: null,
    data: { enabled: true, skus: ['chengju_creator_monthly'], verification: 'external' },
  });
  const result = await fetchBillingProducts('http://127.0.0.1:3200', fakeFetch as typeof fetch);
  assert.equal(result.skus[0], 'chengju_creator_monthly');
});

test('商店交易以真实凭据提交服务端核验', async () => {
  let init: RequestInit | undefined;
  const fakeFetch = async (_input: string | URL | Request, options?: RequestInit) => {
    init = options;
    return Response.json({
      success: true,
      error: null,
      data: { status: 'pending', verified: false },
    });
  };
  const result = await submitBillingPurchase('http://127.0.0.1:3200', {
    platform: 'ios',
    productId: 'chengju_creator_monthly',
    transactionId: 'tx-1',
    purchaseToken: 'receipt-secret',
  }, fakeFetch as typeof fetch);
  assert.equal(result.status, 'pending');
  assert.equal(init?.method, 'POST');
  assert.equal(String(init?.body).includes('receipt-secret'), true);
});
