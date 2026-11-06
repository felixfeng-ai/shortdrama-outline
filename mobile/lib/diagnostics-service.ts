import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { buildDiagnosticEvent } from './diagnostic-event.ts';
import { workspaceApiBaseUrl } from './workspace-api.ts';

const ENABLED = process.env.EXPO_PUBLIC_INTERNAL_DIAGNOSTICS === '1';
const INSTALL_KEY = 'chengju.diagnostics.install.v1';
const QUEUE_KEY = 'chengju.diagnostics.queue.v1';

async function read(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function write(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    return;
  }
  if (value) await SecureStore.setItemAsync(key, value);
  else await SecureStore.deleteItemAsync(key);
}

async function installId(): Promise<string> {
  const existing = (await read(INSTALL_KEY)) ?? '';
  if (/^install_[A-Za-z0-9_-]{8,72}$/.test(existing)) return existing;
  const next = `install_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  await write(INSTALL_KEY, next);
  return next;
}

export async function reportDiagnostic(
  error: unknown,
  errorCode?: number,
  path = '',
): Promise<void> {
  if (!ENABLED) return;
  try {
    const value = error instanceof Error ? error : new Error(String(error));
    const event = buildDiagnosticEvent({
      errorName: value.name,
      message: value.message,
      errorCode,
      path,
      appVersion: Constants.expoConfig?.version ?? 'dev',
      buildVersion: Constants.nativeBuildVersion ?? 'dev',
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      deviceModel: Device.modelName ?? 'unknown',
    });
    const current = JSON.parse((await read(QUEUE_KEY)) ?? '[]') as unknown;
    const queue = Array.isArray(current) ? current.slice(-19) : [];
    queue.push(event);
    await write(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Diagnostics must never block the recovery screen.
  }
}

export async function flushDiagnostics(fetchImpl: typeof fetch): Promise<void> {
  if (!ENABLED || !workspaceApiBaseUrl) return;
  try {
    const raw = await read(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const events = parsed.slice(0, 20);
    const response = await fetchImpl(`${workspaceApiBaseUrl}/api/mobile/events`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installId: await installId(),
        events,
      }),
    });
    if (!response.ok) return;
    const remaining = parsed.slice(events.length);
    await write(QUEUE_KEY, remaining.length ? JSON.stringify(remaining) : null);
  } catch {
    // Keep the queue for the next app start.
  }
}
