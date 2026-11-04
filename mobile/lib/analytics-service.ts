import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { sanitizeAnalyticsEvent, type AnalyticsEvent } from './privacy-analytics';
import { workspaceApiBaseUrl } from './workspace-api';

const ENABLED_KEY = 'chengju.analytics.enabled.v1';
const INSTALL_KEY = 'chengju.analytics.install.v1';
const QUEUE_KEY = 'chengju.analytics.queue.v1';

let enabled = false;
let initialized = false;
let installId = '';
let queue: AnalyticsEvent[] = [];

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

function createId(): string {
  return `install_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export async function initializeAnalytics(): Promise<boolean> {
  if (initialized) return enabled;
  initialized = true;
  enabled = (await read(ENABLED_KEY)) === '1';
  installId = (await read(INSTALL_KEY)) ?? '';
  if (!installedId()) {
    installId = createId();
    await write(INSTALL_KEY, installId);
  }
  try {
    queue = JSON.parse((await read(QUEUE_KEY)) ?? '[]') as AnalyticsEvent[];
    if (!Array.isArray(queue)) queue = [];
  } catch {
    queue = [];
  }
  return enabled;
}

function installedId(): boolean {
  return /^install_[A-Za-z0-9_-]{8,72}$/.test(installId);
}

export function analyticsEnabled(): boolean {
  return enabled;
}

export async function setAnalyticsEnabled(value: boolean): Promise<void> {
  enabled = value;
  await write(ENABLED_KEY, value ? '1' : null);
  if (!value) {
    queue = [];
    await write(QUEUE_KEY, null);
  }
}

export async function trackEvent(
  name: string,
  properties: Record<string, unknown> = {},
  path = '',
): Promise<void> {
  if (!enabled) return;
  queue.push(sanitizeAnalyticsEvent({ name, path, properties }));
  queue = queue.slice(-40);
  await write(QUEUE_KEY, JSON.stringify(queue)).catch(() => {});
}

export async function flushAnalytics(fetchImpl: typeof fetch): Promise<void> {
  if (!enabled || queue.length === 0 || !workspaceApiBaseUrl) return;
  const events = queue.slice(0, 20);
  try {
    const response = await fetchImpl(`${workspaceApiBaseUrl}/api/mobile/events`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId, events }),
    });
    if (!response.ok) return;
    queue = queue.slice(events.length);
    await write(QUEUE_KEY, queue.length ? JSON.stringify(queue) : null);
  } catch {
    // Analytics must never block the product workflow.
  }
}
