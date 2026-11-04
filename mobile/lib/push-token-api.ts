import { resolveApiBaseUrl } from './workspace-api.ts';

export interface PushTokenPayload {
  token: string;
  platform: 'ios' | 'android' | 'unknown';
  deviceName: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function send<T>(
  baseUrl: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<T> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置推送服务地址');
  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/mobile/push-token`, {
      ...init,
      credentials: 'include',
    });
  } catch {
    throw new Error('无法连接推送服务，请检查网络后重试');
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || '推送设置失败');
  }
  return payload.data;
}

export async function registerPushToken(
  baseUrl: string,
  token: PushTokenPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string }> {
  return send(baseUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(token),
  }, fetchImpl);
}

export async function removePushToken(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ removed: boolean }> {
  return send(baseUrl, {
    method: 'DELETE',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }, fetchImpl);
}
