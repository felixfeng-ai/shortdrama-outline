import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  ProgressTrack,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import { useAuth } from '@/lib/auth-store';
import {
  draftFinalTargetIds,
  findDraftFinalMark,
  loadDraftFinalMarks,
  markDraftShotForFinal,
  resolveDraftShotFinal,
} from '@/lib/draft-final-marks';
import {
  DRAFT_MODEL,
  DRAFT_RESOLUTION,
  DRAFT_SECONDS,
  estimateDraftBatch,
  filterDraftTargets,
  isDraftTargetReady,
  newDraftBatchKey,
  submitDraftBatch,
  type DraftBatchResult,
  type DraftBatchEstimate,
  type DraftShotTarget,
} from '@/lib/draft-workflow';
import { safeTaskError, taskStatusLabel } from '@/lib/task-view';
import { videoCostLabel } from '@/lib/video-entry';
import {
  workspaceApiBaseUrl,
  type WorkspaceTaskStatus,
  type WorkspaceVideoTarget,
} from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';
import type { ReviewComment } from '@/lib/review-comments-api';

const TASK_TONES: Record<
  WorkspaceTaskStatus,
  'neutral' | 'info' | 'success' | 'danger'
> = {
  queued: 'neutral',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  canceled: 'neutral',
};

const BATCH_TONE = {
  draft: 'neutral',
  confirmed: 'info',
  running: 'info',
  completed: 'success',
  stopped: 'warning',
  failed: 'danger',
} as const;

const BATCH_LABEL = {
  draft: '草稿',
  confirmed: '已确认',
  running: '生成中',
  completed: '已完成',
  stopped: '部分完成',
  failed: '失败',
} as const;

function episodeTargetsSummary(targets: readonly DraftShotTarget[]) {
  return {
    total: targets.length,
    ready: targets.filter(isDraftTargetReady).length,
  };
}

function projectTaskForTarget(
  tasks: ReturnType<typeof useWorkspace>['data']['tasks'],
  targetId: string,
) {
  return tasks.find((task) => task.mediaKind === 'video' && task.targetId === targetId) ?? null;
}

export default function DraftScreen() {
  const params = useLocalSearchParams<{ projectId?: string | string[] }>();
  const { data, status, refresh, selectProject } = useWorkspace();
  const { authorizedFetch } = useAuth();
  const [episode, setEpisode] = useState(data.hero?.episodeNumber ?? 0);
  const [onlyReady, setOnlyReady] = useState(false);
  const [finals, setFinals] = useState<ReviewComment[]>([]);
  const [finalsLoading, setFinalsLoading] = useState(false);
  const [markBusy, setMarkBusy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<DraftBatchResult | null>(null);
  const [error, setError] = useState('');
  const [markError, setMarkError] = useState('');
  const idempotencyRef = useRef('');
  const deepLinkProjectRef = useRef('');
  const project = data.activeProject;
  const projectId = project?.id ?? '';
  const requestedProjectId = Array.isArray(params.projectId)
    ? params.projectId[0]?.trim()
    : params.projectId?.trim();

  const episodes = useMemo(() => {
    const numbers = [...new Set(
      data.videoTargets
        .map((target) => target.episode)
        .filter((number) => Number.isFinite(number) && number > 0),
    )].sort((left, right) => left - right);
    return numbers;
  }, [data.videoTargets]);

  useEffect(() => {
    if (episodes.length === 0) {
      if (episode !== 0) setEpisode(0);
      return;
    }
    if (episodes.includes(episode)) return;
    const heroEpisode = data.hero?.episodeNumber ?? 0;
    setEpisode(episodes.includes(heroEpisode) ? heroEpisode : episodes[0]);
  }, [data.hero?.episodeNumber, episode, episodes]);

  useEffect(() => {
    idempotencyRef.current = '';
    setReceipt(null);
    setError('');
  }, [episode, project?.id]);

  useEffect(() => {
    if (
      !requestedProjectId
      || project?.id === requestedProjectId
      || deepLinkProjectRef.current === requestedProjectId
    ) return;
    deepLinkProjectRef.current = requestedProjectId;
    void selectProject(requestedProjectId).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : '指定项目载入失败');
    });
  }, [project?.id, requestedProjectId, selectProject]);

  const episodeTargets = useMemo(
    () => filterDraftTargets(data.videoTargets, episode),
    [data.videoTargets, episode],
  );
  const visibleTargets = useMemo(
    () => onlyReady
      ? episodeTargets.filter(isDraftTargetReady)
      : episodeTargets,
    [episodeTargets, onlyReady],
  );
  const readiness = useMemo(
    () => episodeTargetsSummary(episodeTargets),
    [episodeTargets],
  );

  const estimateResult = useMemo(() => {
    try {
      return {
        estimate: estimateDraftBatch(data.videoCapabilities, episodeTargets),
        error: '',
      };
    } catch (reason) {
      return {
        estimate: null,
        error: reason instanceof Error ? reason.message : '草片费用暂时无法计算',
      };
    }
  }, [data.videoCapabilities, episodeTargets]);
  const estimate = estimateResult.estimate;
  const finalTargetIds = useMemo(() => draftFinalTargetIds(finals), [finals]);

  const loadFinals = useCallback(async () => {
    if (!projectId || !workspaceApiBaseUrl) {
      setFinals([]);
      setFinalsLoading(false);
      return;
    }
    setFinalsLoading(true);
    setMarkError('');
    try {
      setFinals(await loadDraftFinalMarks(
        workspaceApiBaseUrl,
        projectId,
        authorizedFetch,
      ));
    } catch (reason) {
      setMarkError(reason instanceof Error ? reason.message : '定稿标记读取失败');
    } finally {
      setFinalsLoading(false);
    }
  }, [authorizedFetch, projectId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      void loadFinals();
    }, [loadFinals, refresh]),
  );

  async function submit() {
    if (!project || !estimate || submitting || estimate.readyCount === 0) return;
    setSubmitting(true);
    setError('');
    try {
      if (!idempotencyRef.current) idempotencyRef.current = newDraftBatchKey();
      const result = await submitDraftBatch(
        workspaceApiBaseUrl,
        {
          projectId: project.id,
          targets: episodeTargets,
          capabilities: data.videoCapabilities,
          idempotencyKey: idempotencyRef.current,
        },
        authorizedFetch,
      );
      setReceipt(result);
      idempotencyRef.current = '';
      refresh();
    } catch (reason) {
      // 网络结果不确定时保留同一个幂等键，用户重试不会重复扣费。
      setError(reason instanceof Error ? reason.message : '整集草片提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleFinal(target: DraftShotTarget) {
    if (!project || markBusy) return;
    const current = findDraftFinalMark(finals, target.targetId);
    setMarkBusy(target.targetId);
    setMarkError('');
    try {
      if (current) {
        await resolveDraftShotFinal(
          workspaceApiBaseUrl,
          project.id,
          current.id,
          authorizedFetch,
        );
        setFinals((items) => items.filter((item) => item.id !== current.id));
      } else {
        const created = await markDraftShotForFinal(
          workspaceApiBaseUrl,
          project.id,
          { targetId: target.targetId, targetName: target.targetLabel },
          authorizedFetch,
        );
        setFinals((items) => [
          created,
          ...items.filter((item) => item.targetId !== target.targetId),
        ]);
      }
    } catch (reason) {
      setMarkError(reason instanceof Error ? reason.message : '定稿标记更新失败');
    } finally {
      setMarkBusy('');
    }
  }

  const currentBatch = receipt?.batch
    ? data.batches.find((batch) => batch.id === receipt.batch?.id) ?? receipt.batch
    : null;
  const currentTasks = currentBatch
    ? data.tasks.filter((task) => task.batchId === currentBatch.id)
    : [];
  const batchTasks = currentTasks.length > 0 ? currentTasks : receipt?.tasks ?? [];
  const completedTasks = batchTasks.filter((task) => task.status === 'succeeded').length;
  const failedTasks = batchTasks.filter(
    (task) => task.status === 'failed' || task.status === 'canceled',
  ).length;
  const blockedCount = receipt?.blocked.length ?? 0;
  const serviceBlockedReason =
    !project
      ? '请先选择项目'
      : !workspaceApiBaseUrl
        ? '尚未配置草片生成服务'
        : !data.videoCapabilities.enabled
          ? '视频服务暂未启用'
          : estimateResult.error
            ? estimateResult.error
            : !episodeTargets.length
              ? '这一集还没有镜头'
              : !estimate?.readyCount
                ? '这一集还没有可生成的镜头'
                : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <ScreenHeader
          kicker="DRAFT FIRST"
          title="整集草片"
          left={<IconButton icon="arrow-left" label="返回 Agent" onPress={() => router.back()} />}
          right={
            <IconButton
              icon="refresh-cw"
              label="刷新草片状态"
              active={status === 'loading'}
              onPress={() => {
                refresh();
                void loadFinals();
              }}
            />
          }
        />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.intro}>
            <Text style={styles.title}>先用一集草片，判断故事能不能跑起来</Text>
            <BodyText dim>
              480P 草片每镜固定 5 秒，只检查表演、镜头衔接和节奏。缺首帧的镜头会留在清单里，不会拖垮同批其他镜头。需要定稿的镜头后续再以 768P/2K 出片。
            </BodyText>
          </View>

          {status === 'loading' && data.videoTargets.length === 0 ? (
            <Panel style={styles.state}>
              <ActivityIndicator color={colors.info} />
              <Text style={styles.stateTitle}>正在读取本集镜头</Text>
              <BodyText dim style={styles.center}>
                同步分镜、首帧和最近一次视频任务。
              </BodyText>
            </Panel>
          ) : !project ? (
            <Panel style={styles.state}>
              <Feather name="folder" size={22} color={colors.textSecondary} />
              <Text style={styles.stateTitle}>还没有项目</Text>
              <BodyText dim style={styles.center}>先从 Agent 首页创建或导入一个项目。</BodyText>
              <SecondaryButton
                label="打开项目"
                icon="arrow-up-right"
                onPress={() => router.push('/projects')}
              />
            </Panel>
          ) : episodes.length === 0 ? (
            <Panel style={styles.state}>
              <Feather name="film" size={22} color={colors.textSecondary} />
              <Text style={styles.stateTitle}>还没有可拍的分镜</Text>
              <BodyText dim style={styles.center}>
                先在 Web 分镜工作台保存镜头和提示词，App 会在这里汇总准备率。
              </BodyText>
              <SecondaryButton
                label="查看任务"
                icon="list"
                onPress={() => router.push('/tasks')}
              />
            </Panel>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.episodeRail}>
                  {episodes.map((number) => {
                    const items = filterDraftTargets(data.videoTargets, number);
                    const summary = episodeTargetsSummary(items);
                    const selected = number === episode;
                    return (
                      <Pressable
                        key={number}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`第 ${number} 集，${summary.ready}/${summary.total} 镜可生成`}
                        onPress={() => setEpisode(number)}
                        style={[
                          styles.episodeChip,
                          selected && styles.episodeChipActive,
                        ]}
                      >
                        <Text style={[styles.episodeTitle, selected && styles.episodeTitleActive]}>
                          第 {number} 集
                        </Text>
                        <Text style={[styles.episodeMeta, selected && styles.episodeMetaActive]}>
                          {summary.ready}/{summary.total} 可生成
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <Panel elevated style={styles.readinessPanel}>
                <View style={styles.panelHead}>
                  <View style={styles.panelCopy}>
                    <Kicker>第 {episode} 集 · 准备率</Kicker>
                    <Text style={styles.panelTitle}>
                      {readiness.ready} / {readiness.total} 镜可以出草片
                    </Text>
                  </View>
                  <MonoText>{readiness.total > 0 ? Math.round((readiness.ready / readiness.total) * 100) : 0}%</MonoText>
                </View>
                <ProgressTrack
                  value={readiness.total > 0 ? (readiness.ready / readiness.total) * 100 : 0}
                  color={readiness.ready === readiness.total ? colors.success : colors.accent}
                />
                <View style={styles.metricRow}>
                  <Metric label="可生成" value={`${readiness.ready} 镜`} />
                  <Metric label="缺首帧" value={`${readiness.total - readiness.ready} 镜`} warn />
                  <Metric
                    label="定稿队列"
                    value={`${episodeTargets.filter((target) => finalTargetIds.has(target.targetId)).length} 镜`}
                  />
                </View>
              </Panel>

              <Panel style={styles.budgetPanel}>
                <View style={styles.panelHead}>
                  <View style={styles.panelCopy}>
                    <Kicker>草片预算</Kicker>
                    <Text style={styles.panelTitle}>先确认费用，再生成整集</Text>
                  </View>
                  <StatusBadge tone={estimate?.readyCount ? 'info' : 'neutral'}>
                    {DRAFT_RESOLUTION}
                  </StatusBadge>
                </View>
                <View style={styles.factGrid}>
                  <Fact label="模型" value={DRAFT_MODEL} />
                  <Fact label="单镜时长" value={`${DRAFT_SECONDS} 秒`} />
                  <Fact
                    label="预计费用"
                    value={estimate ? videoCostLabel(estimate.estimatedCostMicros) : '--'}
                  />
                  <Fact
                    label="预算上限"
                    value={estimate ? videoCostLabel(estimate.budgetLimitMicros) : '--'}
                  />
                </View>
                {readiness.total > readiness.ready ? (
                  <Text style={styles.blockedNote}>
                    缺首帧 {readiness.total - readiness.ready} 镜将单独阻断，不影响其他镜头提交。
                  </Text>
                ) : null}
                {serviceBlockedReason ? (
                  <Text style={styles.serviceNote}>{serviceBlockedReason}</Text>
                ) : null}
                <PrimaryButton
                  label={submitting ? '正在提交草片…' : '确认预算 · 生成整集草片'}
                  icon={submitting ? 'loader' : 'film'}
                  disabled={submitting || Boolean(serviceBlockedReason)}
                  onPress={() => void submit()}
                  style={styles.submitButton}
                />
              </Panel>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {receipt ? (
                <Panel style={styles.receipt}>
                  <View style={styles.panelHead}>
                    <View style={styles.panelCopy}>
                      <Kicker>草片批次</Kicker>
                      <Text style={styles.panelTitle}>
                        {receipt.tasks.length} 个任务已进入队列
                      </Text>
                    </View>
                    <StatusBadge
                      tone={currentBatch ? BATCH_TONE[currentBatch.status] : 'info'}
                    >
                      {currentBatch ? BATCH_LABEL[currentBatch.status] : '已提交'}
                    </StatusBadge>
                  </View>
                  <View style={styles.metricRow}>
                    <Metric label="已完成" value={`${completedTasks} 镜`} />
                    <Metric label="独立失败" value={`${failedTasks} 镜`} warn={failedTasks > 0} />
                    <Metric label="逐镜阻断" value={`${blockedCount} 镜`} warn={blockedCount > 0} />
                  </View>
                  {receipt.failures.length > 0 ? (
                    <Text style={styles.blockedNote}>
                      {receipt.failures.length} 个镜头提交失败，可在任务中心重试。
                    </Text>
                  ) : null}
                  <SecondaryButton
                    label="查看任务并开始审片"
                    icon="arrow-up-right"
                    onPress={() => router.push('/tasks')}
                  />
                </Panel>
              ) : null}

              <View style={styles.sectionHead}>
                <View style={styles.panelCopy}>
                  <Kicker>本集镜头</Kicker>
                  <Text style={styles.sectionTitle}>草片与定稿</Text>
                </View>
                <View style={styles.scopeSwitch} accessibilityRole="tablist">
                  <ScopeButton
                    label="整集"
                    selected={!onlyReady}
                    onPress={() => setOnlyReady(false)}
                  />
                  <ScopeButton
                    label="仅可生成"
                    selected={onlyReady}
                    onPress={() => setOnlyReady(true)}
                  />
                </View>
              </View>

              {markError ? <Text style={styles.error}>{markError}</Text> : null}

              {visibleTargets.length === 0 ? (
                <Panel style={styles.state}>
                  <Feather name="image" size={21} color={colors.textSecondary} />
                  <Text style={styles.stateTitle}>这一集还没有采用首帧</Text>
                  <BodyText dim style={styles.center}>
                    先为镜头采用首帧，再回来生成低成本草片。
                  </BodyText>
                </Panel>
              ) : (
                <Panel style={styles.shotList}>
                  {visibleTargets.map((target, index) => (
                    <ShotRow
                      key={target.targetId}
                      target={target}
                      task={projectTaskForTarget(data.tasks, target.targetId)}
                      marked={finalTargetIds.has(target.targetId)}
                      projectId={project.id}
                      markBusy={markBusy === target.targetId}
                      finalsLoading={finalsLoading}
                      divider={index < visibleTargets.length - 1}
                      onToggleFinal={() => void toggleFinal(target)}
                    />
                  ))}
                </Panel>
              )}
            </>
          )}
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, warn && styles.metricWarn]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.factValue}>{value}</Text>
    </View>
  );
}

function ScopeButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.scopeButton, selected && styles.scopeButtonActive]}
    >
      <Text style={[styles.scopeText, selected && styles.scopeTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ShotRow({
  target,
  task,
  marked,
  projectId,
  markBusy,
  finalsLoading,
  divider,
  onToggleFinal,
}: {
  target: WorkspaceVideoTarget;
  task: ReturnType<typeof projectTaskForTarget>;
  marked: boolean;
  projectId: string;
  markBusy: boolean;
  finalsLoading: boolean;
  divider: boolean;
  onToggleFinal: () => void;
}) {
  const ready = isDraftTargetReady(target);
  const taskStatus = task?.status ?? target.latestTaskStatus;
  const canMarkFinal = taskStatus === 'succeeded' || Boolean(target.selectedVideoAssetId);
  const selectedVideoAssetId = target.selectedVideoAssetId;
  return (
    <View style={[styles.shotRow, divider && styles.shotDivider]}>
      <View style={[styles.shotNumber, !ready && styles.shotNumberBlocked]}>
        <Text style={[styles.shotNumberText, !ready && styles.shotNumberTextBlocked]}>
          {target.shotNumber || '--'}
        </Text>
      </View>
      <View style={styles.shotCopy}>
        <Text style={styles.shotTitle}>第 {target.shotNumber} 镜 · {target.scene}</Text>
        <Text numberOfLines={1} style={styles.shotPrompt}>{target.prompt || '缺少视频提示词'}</Text>
        <View style={styles.shotMeta}>
          {target.latestTaskStatus ? (
            <StatusBadge tone={TASK_TONES[target.latestTaskStatus]}>
              {taskStatusLabel(target.latestTaskStatus)}
            </StatusBadge>
          ) : ready ? (
            <StatusBadge tone="success">首帧就绪</StatusBadge>
          ) : (
            <StatusBadge tone="warning">缺首帧</StatusBadge>
          )}
          {task?.error ? (
            <Text numberOfLines={1} style={styles.shotError}>{safeTaskError(task.error)}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.shotAction}>
        {canMarkFinal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: marked, disabled: finalsLoading || markBusy }}
            accessibilityLabel={`${marked ? '取消' : '标记'}第 ${target.shotNumber} 镜需要定稿`}
            disabled={finalsLoading || markBusy}
            onPress={onToggleFinal}
            style={({ pressed }) => [
              styles.finalButton,
              marked && styles.finalButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Feather
              name={markBusy ? 'loader' : marked ? 'bookmark' : 'bookmark'}
              size={15}
              color={marked ? colors.actionInk : colors.textSecondary}
            />
            <Text style={[styles.finalText, marked && styles.finalTextActive]}>
              {markBusy ? '保存中' : marked ? '已入定稿' : '需要定稿'}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.finalHint}>草片后可标记</Text>
        )}
        {selectedVideoAssetId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`查看第 ${target.shotNumber} 镜草片`}
            onPress={() => router.push({
              pathname: '/review/[id]',
              params: {
                id: selectedVideoAssetId,
                projectId,
                targetType: 'shot',
                targetId: target.targetId,
                targetLabel: target.targetLabel,
                mediaKind: 'video',
              },
            })}
            style={({ pressed }) => [styles.reviewLink, pressed && styles.pressed]}
          >
            <Text style={styles.reviewLinkText}>查看草片</Text>
            <Feather name="chevron-right" size={13} color={colors.info} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  intro: { gap: spacing.xs },
  title: { color: colors.text, fontSize: type.title, fontWeight: '600', lineHeight: 29 },
  state: {
    minHeight: 164,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xl,
  },
  stateTitle: { color: colors.text, fontSize: type.body, fontWeight: '600', textAlign: 'center' },
  center: { maxWidth: 280, textAlign: 'center' },
  episodeRail: { flexDirection: 'row', gap: spacing.xs },
  episodeChip: {
    minWidth: 118,
    minHeight: 56,
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  episodeChipActive: { borderColor: colors.action, backgroundColor: colors.action },
  episodeTitle: { color: colors.text, fontSize: type.label, fontWeight: '600' },
  episodeTitleActive: { color: colors.actionInk },
  episodeMeta: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 9 },
  episodeMetaActive: { color: 'rgba(252,251,248,0.68)' },
  readinessPanel: { padding: spacing.md, gap: spacing.sm },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  panelCopy: { flex: 1, minWidth: 0, gap: 3 },
  panelTitle: { color: colors.text, fontSize: type.bodyLarge, fontWeight: '600', lineHeight: 23 },
  metricRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  metric: { flex: 1, alignItems: 'center', gap: 2 },
  metricValue: { color: colors.text, fontFamily: fonts.mono, fontSize: type.caption, fontWeight: '600' },
  metricWarn: { color: colors.warningInk },
  metricLabel: { color: colors.textMuted, fontSize: type.micro },
  budgetPanel: { padding: spacing.md, gap: spacing.sm },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  fact: { width: '50%', minWidth: 0, gap: 2, paddingRight: spacing.xs },
  factLabel: { color: colors.textMuted, fontSize: type.micro },
  factValue: { color: colors.text, fontSize: type.caption, fontWeight: '600' },
  blockedNote: { color: colors.warningInk, fontSize: type.caption, lineHeight: 18 },
  serviceNote: { color: colors.textMuted, fontSize: type.caption, lineHeight: 18 },
  submitButton: { width: '100%' },
  error: { color: colors.warningInk, fontSize: type.caption, lineHeight: 19 },
  receipt: { padding: spacing.md, gap: spacing.sm },
  sectionHead: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: { color: colors.text, fontSize: type.bodyLarge, fontWeight: '600' },
  scopeSwitch: {
    flexDirection: 'row',
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
    padding: 3,
  },
  scopeButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
  },
  scopeButtonActive: { backgroundColor: colors.surface },
  scopeText: { color: colors.textMuted, fontSize: type.micro, fontWeight: '500' },
  scopeTextActive: { color: colors.text, fontWeight: '600' },
  shotList: { overflow: 'hidden' },
  shotRow: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  shotDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  shotNumber: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: 'rgba(92,117,111,0.1)',
  },
  shotNumberBlocked: { backgroundColor: colors.overlay },
  shotNumberText: { color: colors.info, fontFamily: fonts.mono, fontSize: type.caption, fontWeight: '600' },
  shotNumberTextBlocked: { color: colors.textMuted },
  shotCopy: { flex: 1, minWidth: 0, gap: 3 },
  shotTitle: { color: colors.text, fontSize: type.label, fontWeight: '600', lineHeight: 19 },
  shotPrompt: { color: colors.textMuted, fontSize: type.micro, lineHeight: 16 },
  shotMeta: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  shotError: { flex: 1, color: colors.warningInk, fontSize: 9 },
  shotAction: { flexShrink: 0, alignItems: 'flex-end', gap: spacing.xs },
  finalButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
  },
  finalButtonActive: { borderColor: colors.action, backgroundColor: colors.action },
  finalText: { color: colors.textSecondary, fontSize: type.micro, fontWeight: '500' },
  finalTextActive: { color: colors.actionInk },
  finalHint: { color: colors.textMuted, fontSize: 9, lineHeight: 14, textAlign: 'right' },
  reviewLink: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  reviewLinkText: { color: colors.info, fontSize: type.micro, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});
