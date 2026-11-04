import { resolveApiBaseUrl } from './workspace-api.ts';

export interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
  displayName: string;
  createdAt?: number;
}

export interface EmailCodeResult {
  expiresAt: number;
  cooldownSeconds: number;
  devCode?: string;
}

export interface AuthCredentials {
  user: AuthUser;
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
  claimed?: {
    projects?: number;
    pushSubscriptions?: number;
  };
}

export interface RefreshedAuthCredentials {
  user: AuthUser;
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
}

export class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new Error('邮箱地址不正确');
  }
  return email;
}

function appHeaders(deviceName?: string): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Chengju-Client': 'app',
    ...(deviceName ? { 'X-Chengju-Device': deviceName } : {}),
  };
}

async function readPayload<T>(response: Response): Promise<T> {
  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new AuthApiError('登录服务返回了无法识别的内容', response.status);
  }
  if (!response.ok || !payload.success || !payload.data) {
    throw new AuthApiError(payload.error || '登录服务暂不可用', response.status);
  }
  return payload.data;
}

async function send(
  baseUrl: string,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<Response> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置账号服务地址');
  try {
    return await fetchImpl(`${root}${path}`, {
      ...init,
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接账号服务，请检查网络后重试');
  }
}

export async function requestEmailCode(
  baseUrl: string,
  rawEmail: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<EmailCodeResult> {
  const email = normalizeEmail(rawEmail);
  const response = await send(
    baseUrl,
    '/api/auth/email/request-code',
    {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({ email }),
    },
    fetchImpl,
    signal,
  );
  return readPayload<EmailCodeResult>(response);
}

export async function verifyEmailCode(
  baseUrl: string,
  rawEmail: string,
  code: string,
  deviceName: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AuthCredentials> {
  const email = normalizeEmail(rawEmail);
  const response = await send(
    baseUrl,
    '/api/auth/email/verify-code',
    {
      method: 'POST',
      headers: appHeaders(deviceName),
      body: JSON.stringify({ email, code: code.trim(), client: 'app', deviceName }),
    },
    fetchImpl,
    signal,
  );
  const data = await readPayload<AuthCredentials & { expiresAt?: number }>(response);
  return {
    ...data,
    refreshExpiresAt: data.refreshExpiresAt ?? data.expiresAt ?? 0,
  };
}

export async function refreshAuthSession(
  baseUrl: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<RefreshedAuthCredentials> {
  const response = await send(
    baseUrl,
    '/api/auth/refresh',
    {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({ refreshToken }),
    },
    fetchImpl,
    signal,
  );
  return readPayload<RefreshedAuthCredentials>(response);
}

export async function fetchCurrentUser(
  baseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AuthUser> {
  const response = await send(
    baseUrl,
    '/api/auth/session',
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Chengju-Client': 'app',
      },
    },
    fetchImpl,
    signal,
  );
  const data = await readPayload<{ user: AuthUser | null }>(response);
  if (!data.user) throw new AuthApiError('登录已过期，请重新登录', 401);
  return data.user;
}

export async function logoutAuthSession(
  baseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<void> {
  const response = await send(
    baseUrl,
    '/api/auth/logout',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Chengju-Client': 'app',
      },
    },
    fetchImpl,
    signal,
  );
  await readPayload<{ revoked: boolean }>(response);
}
