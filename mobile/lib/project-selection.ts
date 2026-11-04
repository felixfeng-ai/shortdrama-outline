import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'chengju.activeProject.v1';

export async function loadSelectedProjectId(): Promise<string | null> {
  try {
    const value =
      Platform.OS === 'web'
        ? typeof localStorage === 'undefined'
          ? null
          : localStorage.getItem(KEY)
        : await SecureStore.getItemAsync(KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export async function saveSelectedProjectId(projectId: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    if (projectId) localStorage.setItem(KEY, projectId);
    else localStorage.removeItem(KEY);
    return;
  }
  if (projectId) await SecureStore.setItemAsync(KEY, projectId);
  else await SecureStore.deleteItemAsync(KEY);
}
