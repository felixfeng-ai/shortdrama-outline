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
    const parsed = JSON.parse(value) as WorkspaceCache | { entries?: WorkspaceCache[] };
    const entries = 'entries' in parsed && Array.isArray(parsed.entries)
      ? parsed.entries
      : [parsed as WorkspaceCache];
    return entries
      .filter((entry) => entry && typeof entry === 'object' && entry.data && Array.isArray(entry.data.projects))
      .sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
  } catch {
    return null;
  }
}

function parseAll(value: string | null): WorkspaceCache[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as WorkspaceCache | { entries?: WorkspaceCache[] };
    const entries = 'entries' in parsed && Array.isArray(parsed.entries)
      ? parsed.entries
      : [parsed as WorkspaceCache];
    return entries.filter(
      (entry) => entry && typeof entry === 'object' && entry.data && Array.isArray(entry.data.projects),
    );
  } catch {
    return [];
  }
}

export async function loadWorkspaceCache(projectId?: string | null): Promise<WorkspaceCache | null> {
  try {
    const entries = parseAll(await readRaw());
    if (projectId) return entries.find((entry) => entry.projectId === projectId) ?? null;
    return entries.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
  } catch {
    return null;
  }
}

export async function saveWorkspaceCache(
  projectId: string | null,
  data: WorkspaceData,
): Promise<void> {
  try {
    const current = parseAll(await readRaw());
    const next = [{
      projectId,
      savedAt: Date.now(),
      data,
    } satisfies WorkspaceCache, ...current.filter((entry) => entry.projectId !== projectId)].slice(0, 5);
    await writeRaw(JSON.stringify({ version: 1, entries: next }));
  } catch {
    // Cache is an optimization and must never block the main workflow.
  }
}

export async function clearWorkspaceCache(): Promise<void> {
  try {
    await writeRaw(null);
  } catch {}
}

export async function removeWorkspaceCache(projectId: string): Promise<void> {
  try {
    const entries = parseAll(await readRaw()).filter((entry) => entry.projectId !== projectId);
    await writeRaw(entries.length ? JSON.stringify({ version: 1, entries }) : null);
  } catch {}
}
