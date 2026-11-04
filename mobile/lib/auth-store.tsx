import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import {
  fetchCurrentUser,
  logoutAuthSession,
  refreshAuthSession,
  requestEmailCode,
  verifyEmailCode,
  type AuthCredentials,
  type AuthUser,
  type EmailCodeResult,
  type RefreshedAuthCredentials,
} from './auth-api.ts';
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
} from './auth-storage.ts';
import { workspaceApiBaseUrl } from './workspace-api.ts';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  requestCode: (email: string) => Promise<EmailCodeResult>;
  verifyCode: (email: string, code: string) => Promise<AuthCredentials>;
  logout: () => Promise<void>;
  authorizedFetch: typeof fetch;
}

const AuthContext = createContext<AuthState | null>(null);

const deviceName =
  Platform.OS === 'ios'
    ? 'iOS App'
    : Platform.OS === 'android'
      ? 'Android App'
      : 'Expo Web Preview';

function toStored(value: AuthCredentials | RefreshedAuthCredentials): RefreshedAuthCredentials {
  return {
    user: value.user,
    accessToken: value.accessToken,
    accessExpiresAt: value.accessExpiresAt,
    refreshToken: value.refreshToken,
    refreshExpiresAt: value.refreshExpiresAt,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const credentialsRef = useRef<RefreshedAuthCredentials | null>(null);
  const refreshPromiseRef = useRef<Promise<RefreshedAuthCredentials> | null>(null);

  const applyCredentials = useCallback(async (value: RefreshedAuthCredentials) => {
    credentialsRef.current = value;
    setUser(value.user);
    setStatus('authenticated');
    setError(null);
    await saveAuthSession(value);
  }, []);

  const clearCredentials = useCallback(async () => {
    credentialsRef.current = null;
    setUser(null);
    setStatus('anonymous');
    await clearAuthSession();
  }, []);

  const refreshCredentials = useCallback(async (): Promise<RefreshedAuthCredentials> => {
    const current = credentialsRef.current;
    if (!current) throw new Error('请先登录');
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const promise = refreshAuthSession(workspaceApiBaseUrl, current.refreshToken)
      .then(async (next) => {
        await applyCredentials(next);
        return next;
      })
      .catch(async (cause) => {
        await clearCredentials();
        throw cause;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });
    refreshPromiseRef.current = promise;
    return promise;
  }, [applyCredentials, clearCredentials]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!workspaceApiBaseUrl) {
        if (!cancelled) setStatus('anonymous');
        return;
      }
      const stored = await loadAuthSession();
      if (cancelled) return;
      if (!stored) {
        setStatus('anonymous');
        return;
      }

      credentialsRef.current = stored;
      setUser(stored.user);
      try {
        const next = await refreshAuthSession(workspaceApiBaseUrl, stored.refreshToken);
        if (!cancelled) await applyCredentials(next);
      } catch {
        if (cancelled) return;
        try {
          const current = await fetchCurrentUser(
            workspaceApiBaseUrl,
            stored.accessToken,
          );
          if (!cancelled) {
            setUser(current);
            setStatus('authenticated');
          }
        } catch {
          await clearCredentials();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCredentials, clearCredentials]);

  const requestCode = useCallback((email: string) => {
    setError(null);
    return requestEmailCode(workspaceApiBaseUrl, email);
  }, []);

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      setError(null);
      const result = await verifyEmailCode(
        workspaceApiBaseUrl,
        email,
        code,
        deviceName,
      );
      await applyCredentials(toStored(result));
      return result;
    },
    [applyCredentials],
  );

  const logout = useCallback(async () => {
    const current = credentialsRef.current;
    try {
      if (current) {
        await logoutAuthSession(workspaceApiBaseUrl, current.accessToken);
      }
    } finally {
      await clearCredentials();
    }
  }, [clearCredentials]);

  const authorizedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let credentials = credentialsRef.current;
      if (credentials && credentials.accessExpiresAt <= Date.now() + 30_000) {
        try {
          credentials = await refreshCredentials();
        } catch {
          credentials = null;
        }
      }

      const send = async (value: RefreshedAuthCredentials | null) => {
        const headers = new Headers(init?.headers);
        headers.set('X-Chengju-Client', 'app');
        headers.set('X-Chengju-Device', deviceName);
        if (value) headers.set('Authorization', `Bearer ${value.accessToken}`);
        return fetch(input, {
          ...init,
          headers,
          credentials: 'include',
        });
      };

      let response = await send(credentials);
      if (response.status === 401 && credentialsRef.current) {
        try {
          credentials = await refreshCredentials();
          response = await send(credentials);
        } catch {
          await clearCredentials();
        }
      }
      return response;
    },
    [clearCredentials, refreshCredentials],
  );

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        error,
        requestCode,
        verifyCode,
        logout,
        authorizedFetch: authorizedFetch as typeof fetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth 必须在 AuthProvider 中使用');
  return value;
}
