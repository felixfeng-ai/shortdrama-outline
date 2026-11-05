import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_VERSION,
  parseOnboardingCompletion,
} from './onboarding-state.ts';

interface StoredOnboarding {
  version: number;
  completed: boolean;
  completedAt: string;
}

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(ONBOARDING_STORAGE_KEY);
  }
  return SecureStore.getItemAsync(ONBOARDING_STORAGE_KEY);
}

async function writeRaw(value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    if (value) localStorage.setItem(ONBOARDING_STORAGE_KEY, value);
    else localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    return;
  }
  if (value) await SecureStore.setItemAsync(ONBOARDING_STORAGE_KEY, value);
  else await SecureStore.deleteItemAsync(ONBOARDING_STORAGE_KEY);
}

export async function loadOnboardingCompletion(): Promise<boolean> {
  try {
    return parseOnboardingCompletion(await readRaw());
  } catch {
    return false;
  }
}

export async function saveOnboardingCompletion(): Promise<void> {
  const value: StoredOnboarding = {
    version: ONBOARDING_VERSION,
    completed: true,
    completedAt: new Date().toISOString(),
  };
  await writeRaw(JSON.stringify(value));
}

export async function resetOnboardingCompletion(): Promise<void> {
  await writeRaw(null);
}
