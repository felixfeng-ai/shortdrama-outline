import { Feather } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BodyText, PrimaryButton } from '@/components/ui';
import { colors, spacing, type } from '@/constants/tokens';
import { trackEvent } from '@/lib/analytics-service';
import { reportDiagnostic } from '@/lib/diagnostics-service';

export function AppErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  const pathname = usePathname();

  useEffect(() => {
    void trackEvent('crash_boundary', {
      screen: pathname ?? error.name,
      result: error.message.slice(0, 80),
    });
    void reportDiagnostic(error, undefined, pathname ?? '');
  }, [error, pathname]);

  return (
    <View style={styles.root}>
      <View style={styles.icon}>
        <Feather name="alert-triangle" size={22} color={colors.warning} />
      </View>
      <Text style={styles.title}>页面暂时无法继续</Text>
      <BodyText dim style={styles.body}>
        当前输入和已同步项目不会丢失，可以重新加载这个页面。
      </BodyText>
      <PrimaryButton label="重新加载" icon="refresh-cw" onPress={() => void retry()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  icon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
  },
  title: { color: colors.text, fontSize: type.bodyLarge, fontWeight: '600' },
  body: { maxWidth: 280, textAlign: 'center', fontSize: type.caption },
});
