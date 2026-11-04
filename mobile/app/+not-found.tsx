import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/constants/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '页面不存在', headerShown: false }} />
      <View style={styles.container}>
        <Text style={styles.kicker}>404 / NOT FOUND</Text>
        <Text style={styles.title}>这个页面不存在</Text>
        <Text style={styles.body}>返回 Agent 首页，继续当前项目。</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>返回首页</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  kicker: {
    color: colors.textMuted,
    fontFamily: 'SpaceMono',
    fontSize: type.micro,
  },
  title: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: '600',
  },
  body: {
    color: colors.textSecondary,
    fontSize: type.body,
  },
  link: {
    minHeight: 44,
    marginTop: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    backgroundColor: colors.action,
  },
  linkText: {
    fontSize: type.label,
    color: colors.actionInk,
    fontWeight: '600',
  },
});
