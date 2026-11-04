import { resolveApiBaseUrl, workspaceApiBaseUrl } from './workspace-api.ts';

export interface AccountSession {
  id: string;
  client: string;
  deviceName: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  current: boolean;
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
  if (!root) throw new Error('尚未配置账号服务地址');
  let response: Response;
  try {
    response = await fetchImpl(`${root}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error('无法连接账号服务，请检查网络后重试');
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || payload.data === null) {
    throw new Error(payload?.error || '账号操作失败');
  }
  return payload.data;
}

export async function fetchAccountSessions(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountSession[]> {
  const data = await request<{ sessions: AccountSession[] }>(
    baseUrl,
    '/api/auth/sessions',
    { method: 'GET' },
    fetchImpl,
  );
  return Array.isArray(data.sessions) ? data.sessions : [];
}

export async function revokeAccountSession(
  baseUrl: string,
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await request(baseUrl, '/api/auth/sessions', {
    method: 'DELETE',
    body: JSON.stringify({ sessionId }),
  }, fetchImpl);
}

export async function exportAccount(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  return request(baseUrl, '/api/account/export', { method: 'GET' }, fetchImpl);
}

export async function deleteAccount(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ deleted: boolean; projects: number }> {
  return request(baseUrl, '/api/account', {
    method: 'DELETE',
    body: JSON.stringify({ confirm: 'DELETE' }),
  }, fetchImpl);
}

export function accountExportUrl(): string {
  return `${workspaceApiBaseUrl}/api/account/export`;
}
