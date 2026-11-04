import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { flushAnalytics, initializeAnalytics, trackEvent } from '@/lib/analytics-service';
import { useAuth } from '@/lib/auth-store';

const appStartedAt = Date.now();

export function AnalyticsBridge() {
  const pathname = usePathname();
  const { authorizedFetch } = useAuth();
  const previous = useRef('');

  useEffect(() => {
    void initializeAnalytics().then((enabled) => {
      if (!enabled) return;
      void trackEvent('app_open', { durationMs: Date.now() - appStartedAt }, '/')
        .then(() => flushAnalytics(authorizedFetch));
    });
  }, [authorizedFetch]);

  useEffect(() => {
    if (!pathname) return;
    void trackEvent('screen_view', {
      screen: pathname,
      from: previous.current,
      to: pathname,
    }, pathname);
    previous.current = pathname;
    void flushAnalytics(authorizedFetch);
  }, [authorizedFetch, pathname]);

  return null;
}
