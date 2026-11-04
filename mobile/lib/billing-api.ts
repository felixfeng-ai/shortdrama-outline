import { resolveApiBaseUrl } from './workspace-api.ts';

export interface BillingConfig {
  enabled: boolean;
  skus: string[];
  verification: 'external' | 'pending';
}

export interface BillingPurchasePayload {
  platform: 'ios' | 'android';
  productId: string;
  transactionId: string;
  purchaseToken: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<T> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置订阅服务地址');
  let response: Response;
  try {
    response = await fetchImpl(`${root}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new Error('无法连接订阅服务，请检查网络后重试');
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || payload.data === null) {
    throw new Error(payload?.error || '订阅服务暂不可用');
  }
  return payload.data;
}

export async function fetchBillingProducts(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BillingConfig> {
  return request(baseUrl, '/api/mobile/billing/products', { method: 'GET' }, fetchImpl);
}

export async function submitBillingPurchase(
  baseUrl: string,
  purchase: BillingPurchasePayload,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  status: 'pending' | 'verified' | 'rejected';
  verified: boolean;
  entitlement: Record<string, unknown>;
}> {
  return request(baseUrl, '/api/mobile/billing/verify', {
    method: 'POST',
    body: JSON.stringify(purchase),
  }, fetchImpl);
}
