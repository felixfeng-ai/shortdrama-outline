import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/tokens';
import { AuthProvider } from '@/lib/auth-store';
import { WorkspaceProvider } from '@/lib/workspace-store';

export { ErrorBoundary } from 'expo-router';

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

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
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
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.canvas },
                animation: 'fade',
              }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="review/[id]" />
              <Stack.Screen name="login" />
            </Stack>
          </ThemeProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
