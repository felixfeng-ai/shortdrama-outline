import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { RefreshedAuthCredentials } from './auth-api.ts';

const STORAGE_KEY = 'chengju.auth.session.v1';

export async function loadAuthSession(): Promise<RefreshedAuthCredentials | null> {
  try {
    const raw =
      Platform.OS === 'web'
        ? typeof localStorage === 'undefined'
          ? null
          : localStorage.getItem(STORAGE_KEY)
        : await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RefreshedAuthCredentials>;
    if (
      !value.user?.id ||
      typeof value.accessToken !== 'string' ||
      typeof value.refreshToken !== 'string' ||
      !Number.isFinite(value.accessExpiresAt) ||
      !Number.isFinite(value.refreshExpiresAt)
    ) {
      return null;
    }
    return value as RefreshedAuthCredentials;
  } catch {
    return null;
  }
}

export async function saveAuthSession(value: RefreshedAuthCredentials): Promise<void> {
  const raw = JSON.stringify(value);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, raw);
}

export async function clearAuthSession(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}
