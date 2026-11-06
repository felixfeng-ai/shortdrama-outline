import * as Updates from 'expo-updates';

export type AppUpdateState =
  | { status: 'idle'; message: string }
  | { status: 'checking'; message: string }
  | { status: 'available'; message: string }
  | { status: 'ready'; message: string }
  | { status: 'current'; message: string }
  | { status: 'disabled'; message: string }
  | { status: 'error'; message: string };

export async function checkInternalUpdate(): Promise<AppUpdateState> {
  if (!Updates.isEnabled) {
    return {
      status: 'disabled',
      message: '当前是开发预览，已安装内测包才能收到更新',
    };
  }
  try {
    const checked = await Updates.checkForUpdateAsync();
    if (!checked.isAvailable) {
      return { status: 'current', message: '已是最新内测版' };
    }
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) {
      return { status: 'current', message: '已是最新内测版' };
    }
    return {
      status: 'ready',
      message: '更新已下载，点击后重启生效',
    };
  } catch {
    return {
      status: 'error',
      message: '更新检查失败，请确认网络后重试',
    };
  }
}

export async function applyAppUpdate(): Promise<void> {
  if (!Updates.isEnabled) {
    throw new Error('当前构建不支持内测更新');
  }
  await Updates.reloadAsync();
}
