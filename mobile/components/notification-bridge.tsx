import { useEffect } from 'react';

import { listenForNotificationRoutes } from '@/lib/native-notifications';

export function NotificationBridge() {
  useEffect(() => listenForNotificationRoutes(), []);
  return null;
}
