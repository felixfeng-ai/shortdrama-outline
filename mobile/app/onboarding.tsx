import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SceneFrame } from '@/components/scene-frame';
import {
  BodyText,
  BrandLockup,
  Kicker,
  PrimaryButton,
  ScreenFade,
  SecondaryButton,
} from '@/components/ui';
import { useOnboarding } from '@/components/onboarding-provider';
import { colors, spacing, type } from '@/constants/tokens';

type StartDestination = 'demo' | 'projects' | 'home';

export default function OnboardingScreen() {
  const { completeOnboarding } = useOnboarding();
  const [busy, setBusy] = useState(false);

  async function start(destination: StartDestination) {
    if (busy) return;
    setBusy(true);
    await completeOnboarding();
    if (destination === 'demo') router.replace('/demo');
    else if (destination === 'projects') router.replace('/projects');
    else router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <View style={styles.header}>
          <BrandLockup />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="跳过首次介绍"
            disabled={busy}
            onPress={() => void start('home')}
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
          >
            <Text style={styles.skipText}>跳过</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Kicker style={styles.kicker}>VEYA AGENT · 短剧创作与制作</Kicker>
          <Text style={styles.title}>把一场戏，{'\n'}推到能开拍。</Text>
          <BodyText style={styles.intro}>
            Veya Agent 会读你的角色、场次和镜头，指出具体问题。你确认后，它才动你的项目。
          </BodyText>

          <SceneFrame
            compact
            label="旧楼门口 · 黄昏"
            style={styles.scene}
          />

          <View style={styles.principle}>
            <Text style={styles.principleLabel}>改前先确认</Text>
            <Text style={styles.principleText}>
              不覆盖你或 Web 端刚改过的版本。
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label="用示例剧体验"
            icon="play"
            disabled={busy}
            onPress={() => void start('demo')}
            style={styles.primary}
          />
          <SecondaryButton
            label="直接开始"
            icon="arrow-right"
            disabled={busy}
            onPress={() => void start('projects')}
            style={styles.secondary}
          />
          <Text style={styles.footnote}>登录后可在手机和 Web 继续编辑</Text>
        </View>
      </ScreenFade>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  skip: {
    minWidth: 64,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: type.label,
    fontWeight: '500',
  },
  content: {
    width: '100%',
    maxWidth: 640,
    flexGrow: 1,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  kicker: {
    color: colors.textSecondary,
    fontSize: type.caption,
    letterSpacing: 0,
    textTransform: 'none',
  },
  title: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: 35,
    fontWeight: '600',
    lineHeight: 43,
  },
  intro: {
    marginTop: spacing.md,
    maxWidth: 520,
  },
  scene: {
    width: '100%',
    marginTop: spacing.xxl,
    borderWidth: 0,
  },
  principle: {
    marginTop: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  principleLabel: {
    color: colors.text,
    fontSize: type.caption,
    fontWeight: '600',
  },
  principleText: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: type.caption,
    lineHeight: 18,
  },
  footer: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.canvas,
  },
  primary: {
    minHeight: 54,
  },
  secondary: {
    minHeight: 48,
  },
  footnote: {
    minHeight: 28,
    paddingTop: 5,
    color: colors.textMuted,
    fontSize: type.micro,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
