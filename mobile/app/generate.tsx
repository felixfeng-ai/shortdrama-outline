import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  IconButton,
  Kicker,
  Panel,
  PrimaryButton,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radii, spacing, type } from '@/constants/tokens';
import { useAuth } from '@/lib/auth-store';
import { generateWorkspaceTarget } from '@/lib/generation-entry';
import { useMediaAttachments } from '@/lib/media-attachment-store';
import { attachmentToGenerationReference } from '@/lib/media-encoding';
import { workspaceApiBaseUrl, type WorkspaceGenerationTarget } from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';

const TYPES = [
  { key: 'all', label: '全部' },
  { key: 'shot', label: '镜头' },
  { key: 'character', label: '角色' },
  { key: 'place', label: '地点' },
] as const;

export default function GenerateScreen() {
  const { data } = useWorkspace();
  const { authorizedFetch } = useAuth();
  const { attachments, clearAttachments } = useMediaAttachments();
  const [filter, setFilter] = useState<(typeof TYPES)[number]['key']>('all');
  const [selectedId, setSelectedId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const targets = useMemo(
    () => filter === 'all'
      ? data.generationTargets
      : data.generationTargets.filter((target) => target.targetType === filter),
    [data.generationTargets, filter],
  );
  const selected =
    targets.find((target) => `${target.targetType}:${target.targetId}` === selectedId)
    ?? targets[0]
    ?? null;
  const projectId = data.activeProject?.id ?? '';

  async function generate() {
    if (!selected || !projectId || generating) return;
    setGenerating(true);
    setError('');
    try {
      const result = await generateWorkspaceTarget(
        workspaceApiBaseUrl,
        {
          projectId,
          ...selected,
          referenceImages: await Promise.all(
            attachments.map(attachmentToGenerationReference),
          ),
        },
        authorizedFetch,
      );
      clearAttachments();
      router.replace({
        pathname: '/review/[id]',
        params: {
          id: result.asset.id,
          projectId,
          targetType: selected.targetType,
          targetId: selected.targetId,
          targetLabel: selected.targetLabel,
        },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画面生成失败');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <ScreenHeader
          kicker="GENERATE"
          title="生成画面"
          left={<IconButton icon="arrow-left" label="返回任务" onPress={() => router.back()} />}
        />
        <View style={styles.tabs} accessibilityRole="tablist">
          {TYPES.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === item.key }}
              onPress={() => {
                setFilter(item.key);
                setSelectedId('');
              }}
              style={({ pressed }) => [
                styles.tab,
                filter === item.key && styles.tabActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.tabText, filter === item.key && styles.tabTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {generating ? (
            <Panel style={styles.loadingCard}>
              <ActivityIndicator color={colors.info} />
              <Text style={styles.loadingTitle}>正在生成{targetLabel(selected)}</Text>
              <BodyText dim style={styles.center}>
                图像生成通常需要几十秒，可以离开页面，任务会在任务页继续。
              </BodyText>
            </Panel>
          ) : targets.length === 0 ? (
            <Panel style={styles.emptyCard}>
              <Feather name="image" size={22} color={colors.textSecondary} />
              <Text style={styles.loadingTitle}>这个筛选下没有可生成目标</Text>
              <BodyText dim style={styles.center}>
                先在 Web 工作台保存人物定妆、地点或镜头，App 才能读取提示词。
              </BodyText>
            </Panel>
          ) : (
            <>
              <View style={styles.list}>
                {targets.slice(0, 60).map((target, index) => {
                  const active = selected === target
                    || (selected?.targetType === target.targetType && selected?.targetId === target.targetId);
                  return (
                    <Pressable
                      key={`${target.targetType}:${target.targetId}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => setSelectedId(`${target.targetType}:${target.targetId}`)}
                      style={({ pressed }) => [
                        styles.targetRow,
                        index > 0 && styles.targetBorder,
                        active && styles.targetActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.targetIcon}>
                        <Feather
                          name={target.targetType === 'shot' ? 'film' : target.targetType === 'place' ? 'map-pin' : 'user'}
                          size={17}
                          color={active ? colors.action : colors.textSecondary}
                        />
                      </View>
                      <View style={styles.targetCopy}>
                        <Text style={styles.targetTitle}>{target.targetLabel}</Text>
                        <Text numberOfLines={1} style={styles.targetPrompt}>{target.prompt}</Text>
                      </View>
                      {active ? <Feather name="check" size={16} color={colors.success} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              {selected ? (
                <Panel style={styles.promptCard}>
                  <View style={styles.promptHead}>
                    <Kicker>生成提示词</Kicker>
                    <StatusBadge tone="info">{targetLabel(selected)}</StatusBadge>
                  </View>
                  <Text numberOfLines={8} style={styles.prompt}>{selected.prompt}</Text>
                  {attachments.length > 0 ? (
                    <View style={styles.references}>
                      {attachments.map((attachment) => (
                        <Image
                          key={attachment.id}
                          accessible
                          accessibilityLabel={`参考图 ${attachment.name}`}
                          contentFit="cover"
                          source={{ uri: attachment.uri }}
                          style={styles.referenceImage}
                        />
                      ))}
                      <Text style={styles.referenceText}>
                        {attachments.length} 张参考图会随本次生成提交
                      </Text>
                    </View>
                  ) : null}
                </Panel>
              ) : null}
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!generating && selected ? (
            <PrimaryButton
              label={`生成${targetLabel(selected)}`}
              icon="zap"
              onPress={() => void generate()}
            />
          ) : null}
          {generating ? (
            <SecondaryButton label="生成中…" icon="loader" disabled />
          ) : null}
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

function targetLabel(target: WorkspaceGenerationTarget | null): string {
  if (!target) return '画面';
  if (target.targetType === 'character') return '定妆图';
  if (target.targetType === 'place') return '场景图';
  return '关键帧';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  tabs: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    minHeight: 50,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  tab: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  tabActive: { backgroundColor: colors.action },
  tabText: { color: colors.textSecondary, fontSize: type.caption, fontWeight: '500' },
  tabTextActive: { color: colors.actionInk, fontWeight: '600' },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  list: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  targetRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  targetBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  targetActive: { backgroundColor: colors.accentSoft },
  targetIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  targetCopy: { flex: 1, minWidth: 0, gap: 2 },
  targetTitle: { color: colors.text, fontSize: type.label, fontWeight: '600' },
  targetPrompt: { color: colors.textMuted, fontSize: type.micro },
  promptCard: { padding: spacing.md, gap: spacing.sm },
  promptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  prompt: { color: colors.textSecondary, fontSize: type.caption, lineHeight: 20 },
  references: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  referenceImage: { width: 38, height: 38, borderRadius: 5, backgroundColor: colors.elevated },
  referenceText: { flex: 1, color: colors.textMuted, fontSize: type.micro },
  loadingCard: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  loadingTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  emptyCard: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  center: { textAlign: 'center', fontSize: type.caption },
  error: { color: colors.warningInk, fontSize: type.caption, lineHeight: 19, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
