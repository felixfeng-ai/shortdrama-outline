import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export function currentFeedbackContext(pathname: string) {
  return {
    appVersion: Constants.expoConfig?.version ?? 'dev',
    buildVersion: Constants.nativeBuildVersion ?? 'dev',
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    deviceModel: Device.modelName ?? 'unknown',
    screen: pathname.slice(0, 120),
  };
}
