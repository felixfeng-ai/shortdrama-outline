import { router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  shouldRedirectToOnboarding,
  type OnboardingStatus,
} from '@/lib/onboarding-state';
import {
  loadOnboardingCompletion,
  saveOnboardingCompletion,
} from '@/lib/onboarding-storage';

interface OnboardingState {
  status: OnboardingStatus;
  completeOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OnboardingStatus>('loading');

  useEffect(() => {
    let active = true;
    void loadOnboardingCompletion().then((complete) => {
      if (active) setStatus(complete ? 'complete' : 'pending');
    });
    return () => {
      active = false;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    setStatus('complete');
    try {
      await saveOnboardingCompletion();
    } catch {
      // 本地写入失败时本次会话仍可继续，下次启动会再次展示引导。
    }
  }, []);

  return (
    <OnboardingContext.Provider value={{ status, completeOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingState {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding 必须在 OnboardingProvider 中使用');
  return value;
}

export function OnboardingBootstrap({ appReady }: { appReady: boolean }) {
  const { status } = useOnboarding();
  const segments = useSegments();

  useEffect(() => {
    if (!appReady || status === 'loading') return;
    if (shouldRedirectToOnboarding(status, segments)) {
      router.replace('/onboarding');
      return;
    }
    void SplashScreen.hideAsync().catch(() => {});
  }, [appReady, segments, status]);

  return null;
}
