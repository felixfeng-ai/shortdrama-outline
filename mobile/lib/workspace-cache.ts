import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { WorkspaceData } from './workspace-api.ts';

const KEY = 'chengju.workspace.cache.v1';

export interface WorkspaceCache {
  projectId: string | null;
  savedAt: number;
  data: WorkspaceData;
}

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  }
  return SecureStore.getItemAsync(KEY);
}

async function writeRaw(value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
    return;
  }
  if (value) await SecureStore.setItemAsync(KEY, value);
  else await SecureStore.deleteItemAsync(KEY);
}

export function parseWorkspaceCache(value: string | null): WorkspaceCache | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as WorkspaceCache;
    if (!parsed || typeof parsed !== 'object' || !parsed.data || !Array.isArray(parsed.data.projects)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function loadWorkspaceCache(): Promise<WorkspaceCache | null> {
  try {
    return parseWorkspaceCache(await readRaw());
  } catch {
    return null;
  }
}

export async function saveWorkspaceCache(
  projectId: string | null,
  data: WorkspaceData,
): Promise<void> {
  try {
    await writeRaw(JSON.stringify({
      projectId,
      savedAt: Date.now(),
      data,
    } satisfies WorkspaceCache));
  } catch {
    // Cache is an optimization and must never block the main workflow.
  }
}

export async function clearWorkspaceCache(): Promise<void> {
  try {
    await writeRaw(null);
  } catch {}
}
