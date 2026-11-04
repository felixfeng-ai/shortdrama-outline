import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import {
  notificationRoute,
  pushPlatform,
  type NotificationData,
} from './notification-links.ts';
import {
  registerPushToken,
  removePushToken,
} from './push-token-api.ts';
import { workspaceApiBaseUrl } from './workspace-api.ts';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function easProjectId(): string {
  const id = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof id === 'string' ? id.trim() : '';
}

export async function notificationPermission(): Promise<
  'granted' | 'denied' | 'undetermined' | 'unsupported'
> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (current.canAskAgain) return 'undetermined';
  return 'denied';
}

export async function enableNativeNotifications(
  fetchImpl: typeof fetch,
): Promise<{ token: string; status: 'granted' }> {
  if (Platform.OS === 'web') throw new Error('通知仅支持 iOS / Android 原生构建');
  if (!Device.isDevice) throw new Error('模拟器不支持远程推送，请使用真机');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('generation', {
      name: '生成完成',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('通知权限未开启');
  const projectId = easProjectId();
  if (!projectId) throw new Error('EAS 项目尚未配置，暂时无法注册远程推送');
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(workspaceApiBaseUrl, {
    token: token.data,
    platform: pushPlatform(Platform.OS),
    deviceName: Device.deviceName ?? Device.modelName ?? '移动设备',
  }, fetchImpl);
  return { token: token.data, status: 'granted' };
}

export async function disableNativeNotifications(
  token: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  if (!token) return;
  await removePushToken(workspaceApiBaseUrl, token, fetchImpl);
}

export function listenForNotificationRoutes(): () => void {
  if (Platform.OS === 'web') return () => {};
  const open = (data: NotificationData) => {
    router.push(notificationRoute(data) as never);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    open((response.notification.request.content.data ?? {}) as NotificationData);
  });
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      open((response.notification.request.content.data ?? {}) as NotificationData);
    }
  });
  return () => subscription.remove();
}
