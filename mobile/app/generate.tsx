import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  IconButton,
  Kicker,
  MonoText,
  Panel,
  PrimaryButton,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import { useAuth } from '@/lib/auth-store';
import { resolveFrameAssetId, shotFrameTarget } from '@/lib/first-frame';
import { recommendedGenerationTarget } from '@/lib/generation-recommendation';
import { generateWorkspaceTarget } from '@/lib/generation-entry';
import { useMediaAttachments } from '@/lib/media-attachment-store';
import { attachmentToGenerationReference } from '@/lib/media-encoding';
import {
  estimatePublicVideoCostMicros,
  generateWorkspaceVideo,
  newVideoIdempotencyKey,
  videoCostLabel,
  videoModelCapability,
} from '@/lib/video-entry';
import {
  workspaceApiBaseUrl,
  type WorkspaceGenerationTarget,
  type WorkspaceVideoTarget,
} from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';

const TYPES = [
  { key: 'all', label: '全部' },
  { key: 'shot', label: '镜头' },
  { key: 'character', label: '角色' },
  { key: 'place', label: '地点' },
] as const;

type GenerateMode = 'image' | 'video';

interface GenerationOption extends WorkspaceGenerationTarget {
  key: string;
  kind: GenerateMode;
  duration: number | null;
  ratio: '9:16' | '16:9' | null;
  selectedFrameAssetId: string | null;
  latestTaskStatus: WorkspaceVideoTarget['latestTaskStatus'];
  blockedReason: string | null;
}

export default function GenerateScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { data, refresh } = useWorkspace();
  const { authorizedFetch } = useAuth();
  const { attachments, clearAttachments } = useMediaAttachments();
  const [mode, setMode] = useState<GenerateMode>(params.mode === 'video' ? 'video' : 'image');
  const [filter, setFilter] = useState<(typeof TYPES)[number]['key']>('all');
  const [selectedId, setSelectedId] = useState('');
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingFrame, setGeneratingFrame] = useState(false);
  const [generatedFrames, setGeneratedFrames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const videoModel = videoModelCapability(
    data.videoCapabilities,
    data.videoCapabilities.defaultModel,
  );
  const videoResolution = data.videoCapabilities.defaultResolution;
  const videoEnabled = data.videoCapabilities.enabled
    && Boolean(videoModel)
    && Number.isFinite(videoModel?.pricesPerSecond[videoResolution]);
  const targets = useMemo<GenerationOption[]>(() => {
    if (mode === 'video') {
      const videoTargets = filter === 'all' || filter === 'shot'
        ? data.videoTargets
        : [];
      return videoTargets.map((target) => ({
        ...target,
        key: `video:${target.targetType}:${target.targetId}`,
        kind: 'video',
        aspect: target.ratio === '16:9' ? 'landscape' : 'vertical',
      }));
    }
    const imageTargets = filter === 'all'
      ? data.generationTargets
      : data.generationTargets.filter((target) => target.targetType === filter);
    return imageTargets.map((target) => ({
      ...target,
      key: `image:${target.targetType}:${target.targetId}`,
      kind: 'image',
      duration: null,
      ratio: null,
      selectedFrameAssetId: null,
      latestTaskStatus: null,
      blockedReason: null,
    }));
  }, [data.generationTargets, data.videoTargets, filter, mode]);
  const recommended = recommendedGenerationTarget(targets);
  const selected = targets.find((target) => target.key === selectedId)
    ?? recommended
    ?? targets[0]!;
  const frameTarget = selected?.kind === 'video'
    ? shotFrameTarget(data.generationTargets, selected)
    : null;
  const effectiveFrameAssetId = selected?.kind === 'video'
    ? resolveFrameAssetId(
        selected.selectedFrameAssetId,
        generatedFrames[selected.targetId],
      )
    : null;
  const missingFrame = selected?.kind === 'video' && !effectiveFrameAssetId;
  const busy = generating || generatingFrame;
  const selectedVideoCost = selected?.kind === 'video'
    && selected.duration
    && videoEnabled
    ? estimatePublicVideoCostMicros(
        data.videoCapabilities,
        data.videoCapabilities.defaultModel,
        videoResolution,
        selected.duration,
      )
    : 0;
  const videoBlockedReason = selected?.kind === 'video'
    ? !videoEnabled
      ? '平台视频服务尚未开启'
      : selected.blockedReason && selected.blockedReason !== '先采用一张首帧'
        ? selected.blockedReason
        : (selected.latestTaskStatus === 'queued' || selected.latestTaskStatus === 'running'
          ? '这个镜头已有视频任务'
          : null)
    : null;
  const projectId = data.activeProject?.id ?? '';

  async function generateFirstFrame() {
    if (!selected || selected.kind !== 'video' || !frameTarget || !projectId || busy) return;
    setGeneratingFrame(true);
    setError('');
    try {
      const result = await generateWorkspaceTarget(
        workspaceApiBaseUrl,
        {
          projectId,
          ...frameTarget,
          referenceImages: await Promise.all(
            attachments.map(attachmentToGenerationReference),
          ),
        },
        authorizedFetch,
      );
      setGeneratedFrames((current) => ({
        ...current,
        [selected.targetId]: result.asset.id,
      }));
      clearAttachments();
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '首帧生成失败');
    } finally {
      setGeneratingFrame(false);
    }
  }

  async function generateTextVideo() {
    if (!selected || selected.kind !== 'video' || !projectId || busy) return;
    setGenerating(true);
    setError('');
    try {
      if (!videoEnabled || !selected.duration) throw new Error('视频服务或时长配置不可用');
      const result = await generateWorkspaceVideo(
        workspaceApiBaseUrl,
        {
          projectId,
          targetId: selected.targetId,
          mode: 'text-to-video',
          prompt: selected.prompt,
          model: data.videoCapabilities.defaultModel,
          resolution: videoResolution,
          duration: selected.duration,
          ratio: selected.ratio ?? '9:16',
          maxBudgetMicros: selectedVideoCost,
          idempotencyKey: newVideoIdempotencyKey(),
        },
        authorizedFetch,
      );
      router.replace({
        pathname: '/tasks',
        params: { projectId, taskId: result.task.id },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '视频任务提交失败');
    } finally {
      setGenerating(false);
    }
  }

  async function generate() {
    if (!selected || !projectId || busy) return;
    setGenerating(true);
    setError('');
    try {
      if (selected.kind === 'video') {
        if (!effectiveFrameAssetId) throw new Error('请先生成一张首帧');
        if (!videoEnabled || !selected.duration) throw new Error('视频服务或时长配置不可用');
        const result = await generateWorkspaceVideo(
          workspaceApiBaseUrl,
          {
            projectId,
            targetId: selected.targetId,
            sourceAssetId: effectiveFrameAssetId,
            prompt: selected.prompt,
            model: data.videoCapabilities.defaultModel,
            resolution: videoResolution,
            duration: selected.duration,
            ratio: selected.ratio ?? '9:16',
            maxBudgetMicros: selectedVideoCost,
            idempotencyKey: newVideoIdempotencyKey(),
          },
          authorizedFetch,
        );
        router.replace({
          pathname: '/tasks',
          params: { projectId, taskId: result.task.id },
        });
        return;
      }
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
        <View style={styles.modeBar} accessibilityRole="tablist">
          {(['image', 'video'] as const).map((item) => {
            const active = mode === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setMode(item);
                  setFilter('all');
                  setSelectedId('');
                  setError('');
                }}
                style={({ pressed }) => [
                  styles.modeTab,
                  active && styles.modeTabActive,
                  pressed && styles.pressed,
                ]}
              >
                <Feather
                  name={item === 'video' ? 'film' : 'image'}
                  size={15}
                  color={active ? colors.actionInk : colors.textSecondary}
                />
                <Text style={[styles.modeText, active && styles.modeTextActive]}>
                  {item === 'video' ? '镜头视频' : '关键帧'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.tabs} accessibilityRole="tablist">
          {(mode === 'video' ? TYPES.filter((item) => item.key === 'all' || item.key === 'shot') : TYPES)
            .map((item) => (
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
          {busy ? (
            <Panel style={styles.loadingCard}>
              <ActivityIndicator color={colors.info} />
              <Text style={styles.loadingTitle}>
                {generatingFrame
                  ? '正在为当前镜头生成首帧'
                  : mode === 'video'
                    ? '正在提交镜头视频'
                    : `正在生成${targetLabel(selected, mode)}`}
              </Text>
              <BodyText dim style={styles.center}>
                {generatingFrame
                  ? '首帧生成后会立即成为当前镜头的视频输入，无需回到 Web。'
                  : '图像生成通常需要几十秒，可以离开页面，任务会在任务页继续。'}
              </BodyText>
            </Panel>
          ) : targets.length === 0 ? (
            <Panel style={styles.emptyCard}>
              <Feather name="image" size={22} color={colors.textSecondary} />
              <Text style={styles.loadingTitle}>这个筛选下没有可生成目标</Text>
              <BodyText dim style={styles.center}>
                {mode === 'video'
                  ? '先在项目里保存镜头；缺首帧时可以直接在 App 补一张。'
                  : '先在项目里保存人物定妆、地点或镜头，App 才能读取提示词。'}
              </BodyText>
            </Panel>
          ) : (
            <>
              <View style={styles.recommendationCard}>
                <View style={styles.recommendationHead}>
                  <View>
                    <Kicker>推荐目标</Kicker>
                    <Text style={styles.recommendationHint}>
                      {mode === 'video' ? '下一步最值得生成的一段镜头' : '下一步最值得补充的一张画面'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setTargetPickerOpen(true)}
                    style={({ pressed }) => [styles.changeTarget, pressed && styles.pressed]}
                  >
                    <Feather name="shuffle" size={14} color={colors.textSecondary} />
                    <Text style={styles.changeTargetText}>更换目标</Text>
                  </Pressable>
                </View>
                <View style={styles.recommendationIdentity}>
                  <View style={styles.targetIcon}>
                    <Feather
                      name={mode === 'video' ? 'video' : selected.targetType === 'shot' ? 'film' : selected.targetType === 'place' ? 'map-pin' : 'user'}
                      size={17}
                      color={colors.action}
                    />
                  </View>
                  <View style={styles.targetCopy}>
                    <Text style={styles.recommendationTitle}>{selected.targetLabel}</Text>
                    <Text numberOfLines={3} style={styles.recommendationPrompt}>
                      {mode === 'video' && videoBlockedReason
                        ? videoBlockedReason
                        : selected.prompt}
                    </Text>
                  </View>
                </View>
              </View>
              {selected ? (
                <Panel style={styles.promptCard}>
                  <View style={styles.promptHead}>
                    <Kicker>生成提示词</Kicker>
                    <StatusBadge tone="info">{targetLabel(selected, mode)}</StatusBadge>
                  </View>
                  <Text numberOfLines={8} style={styles.prompt}>{selected.prompt}</Text>
                  {mode === 'video' ? (
                    <View style={styles.videoSummary}>
                      <StatusBadge tone={missingFrame || videoBlockedReason ? 'warning' : 'info'}>
                        {missingFrame
                          ? '缺首帧'
                          : videoBlockedReason
                            ? videoBlockedReason
                            : `${data.videoCapabilities.defaultModel} · ${videoResolution}`}
                      </StatusBadge>
                      <Text style={styles.videoCost}>
                        {selected.duration ?? 5} 秒 · 约 {videoCostLabel(selectedVideoCost)}
                      </Text>
                    </View>
                  ) : attachments.length > 0 ? (
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
              {selected?.kind === 'video' && missingFrame ? (
                <View style={styles.frameRepair}>
                  <View style={styles.frameRepairHead}>
                    <Feather name="image" size={16} color={colors.warningInk} />
                    <Text style={styles.frameRepairTitle}>这个镜头还缺首帧</Text>
                  </View>
                  <Text style={styles.frameRepairText}>
                    {frameTarget
                      ? '用当前镜头提示词生成一张画面，成功后可直接继续生成视频；也可以跳过首帧，直接使用文生视频。'
                      : '当前镜头没有可用于生成首帧的提示词，请先在 Web 补全分镜。'}
                  </Text>
                </View>
              ) : null}
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!busy && selected ? (
            <PrimaryButton
              label={
                mode === 'video'
                  ? videoBlockedReason
                    ? '暂不能生成视频'
                    : missingFrame
                      ? frameTarget
                        ? '在 App 生成首帧'
                        : '当前镜头缺首帧条件'
                      : `生成视频 · ${videoCostLabel(selectedVideoCost)}`
                  : `生成${targetLabel(selected, mode)}`
              }
              icon={missingFrame ? 'image' : 'zap'}
              disabled={mode === 'video' && (Boolean(videoBlockedReason) || (missingFrame && !frameTarget))}
              onPress={() => {
                if (mode === 'video' && missingFrame) void generateFirstFrame();
                else void generate();
              }}
            />
          ) : null}
          {!busy && selected?.kind === 'video' && missingFrame && !videoBlockedReason ? (
            <SecondaryButton
              label={`直接生成视频（文生视频）· ${videoCostLabel(selectedVideoCost)}`}
              icon="video"
              onPress={() => void generateTextVideo()}
            />
          ) : null}
          {busy ? (
            <SecondaryButton label="生成中…" icon="loader" disabled />
          ) : null}
        </ScrollView>
        <Modal
          animationType="slide"
          onRequestClose={() => setTargetPickerOpen(false)}
          transparent
          visible={targetPickerOpen}
        >
          <View style={styles.sheetScrim}>
            <Pressable
              accessibilityLabel="关闭目标选择"
              onPress={() => setTargetPickerOpen(false)}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHead}>
                <View>
                  <Kicker>选择目标</Kicker>
                  <Text style={styles.sheetTitle}>
                    {mode === 'video' ? '要生成哪一段镜头' : '要补充哪一张画面'}
                  </Text>
                </View>
                <IconButton
                  icon="x"
                  label="关闭目标选择"
                  onPress={() => setTargetPickerOpen(false)}
                />
              </View>
              <ScrollView contentContainerStyle={styles.sheetList}>
                {targets.slice(0, 60).map((target) => {
                  const active = selected?.key === target.key;
                  const blocked = target.kind === 'video'
                    && Boolean(target.blockedReason || !videoEnabled);
                  return (
                    <Pressable
                      key={target.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => {
                        setSelectedId(target.key);
                        setTargetPickerOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.targetRow,
                        active && styles.targetActive,
                        blocked && styles.targetBlocked,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.targetIcon}>
                        <Feather
                          name={target.kind === 'video'
                            ? 'video'
                            : target.targetType === 'shot'
                              ? 'film'
                              : target.targetType === 'place'
                                ? 'map-pin'
                                : 'user'}
                          size={17}
                          color={active ? colors.action : colors.textSecondary}
                        />
                      </View>
                      <View style={styles.targetCopy}>
                        <Text style={styles.targetTitle}>{target.targetLabel}</Text>
                        <Text numberOfLines={1} style={styles.targetPrompt}>
                          {blocked && target.blockedReason ? target.blockedReason : target.prompt}
                        </Text>
                      </View>
                      {active ? <Feather name="check" size={16} color={colors.success} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScreenFade>
    </SafeAreaView>
  );
}

function targetLabel(target: WorkspaceGenerationTarget | null, mode: GenerateMode = 'image'): string {
  if (!target) return '画面';
  if (mode === 'video') return '镜头视频';
  if (target.targetType === 'character') return '定妆图';
  if (target.targetType === 'place') return '场景图';
  return '关键帧';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  modeBar: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    minHeight: 48,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  modeTab: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  modeTabActive: {
    borderColor: colors.action,
    backgroundColor: colors.action,
  },
  modeText: {
    color: colors.textSecondary,
    fontSize: type.caption,
    fontWeight: '600',
  },
  modeTextActive: {
    color: colors.actionInk,
  },
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
  recommendationCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  recommendationHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recommendationHint: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: type.micro,
  },
  changeTarget: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  changeTargetText: {
    color: colors.textSecondary,
    fontSize: type.micro,
    fontWeight: '500',
  },
  recommendationIdentity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  recommendationTitle: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
    lineHeight: 22,
  },
  recommendationPrompt: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: type.caption,
    lineHeight: 19,
  },
  sheetScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(25,26,24,0.42)',
  },
  sheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.canvas,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  sheetList: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
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
  targetBlocked: { opacity: 0.68 },
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
  targetDuration: { color: colors.textMuted, fontSize: type.micro },
  promptCard: { padding: spacing.md, gap: spacing.sm },
  promptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  prompt: { color: colors.textSecondary, fontSize: type.caption, lineHeight: 20 },
  frameRepair: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(184,101,79,0.24)',
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  frameRepairHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  frameRepairTitle: {
    color: colors.warningInk,
    fontSize: type.body,
    fontWeight: '600',
  },
  frameRepairText: {
    color: colors.textSecondary,
    fontSize: type.caption,
    lineHeight: 19,
  },
  references: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  referenceImage: { width: 38, height: 38, borderRadius: 5, backgroundColor: colors.elevated },
  referenceText: { flex: 1, color: colors.textMuted, fontSize: type.micro },
  videoSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  videoCost: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: type.micro,
  },
  loadingCard: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  loadingTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  emptyCard: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  center: { textAlign: 'center', fontSize: type.caption },
  error: { color: colors.warningInk, fontSize: type.caption, lineHeight: 19, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
