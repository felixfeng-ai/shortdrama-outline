import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationBridge } from '@/components/notification-bridge';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { AnalyticsBridge } from '@/components/analytics-bridge';
import { OnboardingBootstrap, OnboardingProvider } from '@/components/onboarding-provider';
import { TaskRecoveryBridge } from '@/components/task-recovery-bridge';
import { colors } from '@/constants/tokens';
import { AuthProvider } from '@/lib/auth-store';
import { WorkspaceProvider } from '@/lib/workspace-store';
import { MediaAttachmentProvider } from '@/lib/media-attachment-store';

export const ErrorBoundary = AppErrorBoundary;

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <MediaAttachmentProvider>
          <WorkspaceProvider>
          <ThemeProvider
            value={{
              ...DefaultTheme,
              colors: {
                ...DefaultTheme.colors,
                primary: colors.action,
                background: colors.canvas,
                card: colors.surface,
                text: colors.text,
                border: colors.line,
                notification: colors.warning,
              },
            }}>
            <OnboardingProvider>
              <NotificationBridge />
              <AnalyticsBridge />
              <TaskRecoveryBridge />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.canvas },
                  animation: 'fade',
                }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
                <Stack.Screen name="review/[id]" />
                <Stack.Screen name="login" />
              </Stack>
              <OnboardingBootstrap appReady={loaded} />
            </OnboardingProvider>
          </ThemeProvider>
          </WorkspaceProvider>
        </MediaAttachmentProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
