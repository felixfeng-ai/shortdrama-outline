import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AgentSessionState } from './agent-session';
import { parseStoredAgentSession } from './agent-session-codec';

const PREFIX = 'chengju.agent.session.v1';

function key(scope: string): string {
  return `${PREFIX}.${scope.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

async function read(scope: string): Promise<string | null> {
  const storageKey = key(scope);
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
  }
  return SecureStore.getItemAsync(storageKey);
}

async function write(scope: string, value: string | null): Promise<void> {
  const storageKey = key(scope);
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    if (value) localStorage.setItem(storageKey, value);
    else localStorage.removeItem(storageKey);
    return;
  }
  if (value) await SecureStore.setItemAsync(storageKey, value);
  else await SecureStore.deleteItemAsync(storageKey);
}

export async function loadAgentSession(scope: string): Promise<AgentSessionState | null> {
  try {
    return parseStoredAgentSession(await read(scope));
  } catch {
    return null;
  }
}

export async function saveAgentSession(
  scope: string,
  state: AgentSessionState,
): Promise<void> {
  try {
    await write(scope, JSON.stringify({
      ...state,
      toolSteps: [],
    }));
  } catch {
    // Session persistence is a recovery aid and must not block Agent use.
  }
}

export async function clearAgentSession(scope: string): Promise<void> {
  try {
    await write(scope, null);
  } catch {}
}
