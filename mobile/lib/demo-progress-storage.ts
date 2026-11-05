import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { parseDemoProgress, type DemoStepId } from './demo-walkthrough';

const KEY = 'chengju.demo.walkthrough.v1';

export async function loadDemoProgress(): Promise<DemoStepId> {
  try {
    const value = Platform.OS === 'web'
      ? typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
      : await SecureStore.getItemAsync(KEY);
    return parseDemoProgress(value);
  } catch {
    return 'sample';
  }
}

export async function saveDemoProgress(step: DemoStepId): Promise<void> {
  const value = JSON.stringify({ step });
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, value);
    } else {
      await SecureStore.setItemAsync(KEY, value);
    }
  } catch {
    // 演示进度只是辅助状态，保存失败不能阻断真实创作流程。
  }
}

export async function resetDemoProgress(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
    } else {
      await SecureStore.deleteItemAsync(KEY);
    }
  } catch {}
}
