import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  IconButton,
  Kicker,
  Panel,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import {
  DEMO_STEPS,
  demoStepIndex,
  nextDemoStep,
  type DemoStepId,
} from '@/lib/demo-walkthrough';
import {
  loadDemoProgress,
  resetDemoProgress,
  saveDemoProgress,
} from '@/lib/demo-progress-storage';
import { useWorkspace } from '@/lib/workspace-store';

export default function DemoScreen() {
  const { loadSampleProject } = useWorkspace();
  const [step, setStep] = useState<DemoStepId>('sample');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void loadDemoProgress().then(setStep);
  }, []);

  async function advance(next: DemoStepId) {
    setStep(next);
    await saveDemoProgress(next);
  }

  async function run(item: DemoStepId) {
    if (busy) return;
    setError('');
    setNotice('');
    if (item === 'sample') {
      setBusy(true);
      try {
        await loadSampleProject();
        await advance('agent');
        setNotice('示例项目已载入。下一步让 Agent 读一遍当前场次。');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '示例项目载入失败');
      } finally {
        setBusy(false);
      }
      return;
    }
    await advance(nextDemoStep(item));
    if (item === 'agent') router.replace('/');
    else if (item === 'generate') router.push('/generate?mode=video');
    else if (item === 'review') router.push('/tasks');
    else router.replace('/projects');
  }

  async function reset() {
    await resetDemoProgress();
    setStep('sample');
    setNotice('演示进度已重置');
  }

  const currentIndex = demoStepIndex(step);
  const progress = Math.round((currentIndex / (DEMO_STEPS.length - 1)) * 100);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <ScreenHeader
          kicker="WALKTHROUGH"
          title="五分钟演示"
          left={<IconButton icon="arrow-left" label="返回" onPress={() => router.back()} />}
          right={<IconButton icon="rotate-ccw" label="重置演示" onPress={() => void reset()} />}
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Kicker>真实链路</Kicker>
            <Text style={styles.headline}>从一部示例剧走到审片</Text>
            <BodyText dim>
              每一步只跳转真实页面。生成与采用仍由你确认，不会自动扣费。
            </BodyText>
            <View style={styles.progressHead}>
              <Text style={styles.progressText}>{progress}%</Text>
              <Text style={styles.progressMeta}>{currentIndex + 1} / {DEMO_STEPS.length}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${progress}%` }]} />
            </View>
          </View>

          <View style={styles.timeline}>
            {DEMO_STEPS.map((item, index) => {
              const complete = index < currentIndex;
              const active = index === currentIndex;
              return (
                <View key={item.id} style={styles.stepRow}>
                  <View style={styles.rail}>
                    <View style={[
                      styles.dot,
                      complete && styles.dotComplete,
                      active && styles.dotActive,
                    ]}>
                      {complete ? (
                        <Feather name="check" size={13} color={colors.actionInk} />
                      ) : (
                        <Text style={[styles.dotText, active && styles.dotTextActive]}>
                          {index + 1}
                        </Text>
                      )}
                    </View>
                    {index < DEMO_STEPS.length - 1 ? <View style={styles.line} /> : null}
                  </View>
                  <Panel style={[styles.stepCard, active && styles.stepCardActive]}>
                    <Text style={styles.stepTitle}>{item.title}</Text>
                    <Text style={styles.stepDescription}>{item.description}</Text>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => void run(item.id)}
                      style={({ pressed }) => [
                        styles.action,
                        active && styles.actionActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      {busy && active ? (
                        <ActivityIndicator size="small" color={active ? colors.actionInk : colors.textSecondary} />
                      ) : (
                        <Feather
                          name={complete ? 'check-circle' : 'arrow-up-right'}
                          size={14}
                          color={active ? colors.actionInk : colors.textSecondary}
                        />
                      )}
                      <Text style={[styles.actionText, active && styles.actionTextActive]}>
                        {busy && active ? '准备中…' : item.actionLabel}
                      </Text>
                    </Pressable>
                  </Panel>
                </View>
              );
            })}
          </View>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <SecondaryButton
            label="重新开始演示"
            icon="rotate-ccw"
            onPress={() => void reset()}
          />
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  intro: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headline: { color: colors.text, fontSize: type.title, fontWeight: '600', lineHeight: 32 },
  progressHead: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  progressText: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  progressMeta: { color: colors.textMuted, fontSize: type.micro },
  track: {
    height: 4,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: colors.elevated,
  },
  trackFill: { height: '100%', backgroundColor: colors.action },
  timeline: { gap: 0 },
  stepRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  rail: { width: 30, alignItems: 'center' },
  dot: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: colors.surface,
  },
  dotActive: { borderColor: colors.action, backgroundColor: colors.action },
  dotComplete: { borderColor: colors.success, backgroundColor: colors.success },
  dotText: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 10 },
  dotTextActive: { color: colors.actionInk },
  line: { width: 1, flex: 1, minHeight: 32, backgroundColor: colors.line },
  stepCard: {
    flex: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  stepCardActive: { borderColor: 'rgba(92,117,111,0.32)' },
  stepTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  stepDescription: { color: colors.textSecondary, fontSize: type.caption, lineHeight: 19 },
  action: {
    minHeight: 40,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  actionActive: { borderColor: colors.action, backgroundColor: colors.action },
  actionText: { color: colors.textSecondary, fontSize: type.micro, fontWeight: '600' },
  actionTextActive: { color: colors.actionInk },
  notice: { color: colors.info, fontSize: type.caption, lineHeight: 19 },
  error: { color: colors.warningInk, fontSize: type.caption, lineHeight: 19 },
  pressed: { opacity: 0.7 },
});
