import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  Divider,
  IconButton,
  Kicker,
  MonoText,
  Panel,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
  StatusBadge,
  StatusDot,
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import {
  filterTasksByMedia,
  filterWorkspaceTasks,
  hasActiveTasks,
  safeTaskError,
  taskMediaCounts,
  taskMediaLabel,
  taskCounts,
  taskCreatedLabel,
  taskDurationLabel,
  taskStatusLabel,
  type TaskCounts,
  type TaskFilter,
  type TaskMediaFilter,
} from '@/lib/task-view';
import { useWorkspace, type WorkspaceSyncStatus } from '@/lib/workspace-store';
import type {
  WorkspaceBatch,
  WorkspaceTask,
  WorkspaceTaskStatus,
} from '@/lib/workspace-api';
import { useAuth } from '@/lib/auth-store';
import { cancelWorkspaceTask, retryWorkspaceTask } from '@/lib/task-actions';
import { workspaceApiBaseUrl } from '@/lib/workspace-api';

const FILTERS: ReadonlyArray<{
  key: TaskFilter;
  label: string;
  countKey: keyof TaskCounts;
}> = [
  { key: 'all', label: '全部', countKey: 'total' },
  { key: 'active', label: '进行中', countKey: 'active' },
  { key: 'done', label: '已完成', countKey: 'done' },
  { key: 'failed', label: '异常', countKey: 'failed' },
];

const MEDIA_FILTERS: ReadonlyArray<{ key: TaskMediaFilter; label: string }> = [
  { key: 'all', label: '全部媒体' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
];

const TARGET_LABELS = {
  shot: '镜头',
  character: '角色',
  place: '地点',
} as const;

const STATUS_META: Record<
  WorkspaceTaskStatus,
  {
    tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
    color: string;
    icon: keyof typeof Feather.glyphMap;
  }
> = {
  queued: { tone: 'neutral', color: colors.textMuted, icon: 'clock' },
  running: { tone: 'info', color: colors.info, icon: 'loader' },
  succeeded: { tone: 'success', color: colors.success, icon: 'check' },
  failed: { tone: 'danger', color: colors.danger, icon: 'alert-circle' },
  canceled: { tone: 'neutral', color: colors.textMuted, icon: 'slash' },
};

const BATCH_STATUS_LABELS: Record<WorkspaceBatch['status'], string> = {
  draft: '草稿',
  confirmed: '已确认',
  running: '进行中',
  completed: '已完成',
  stopped: '已停止',
  failed: '失败',
};

function syncCopy(status: WorkspaceSyncStatus): string {
  if (status === 'loading') return '同步中';
  if (status === 'synced') return '已同步';
  if (status === 'cached') return '使用缓存';
  if (status === 'error') return '同步失败';
  return '本地预览';
}

function yuan(micros: number): string {
  return `¥${(Math.max(0, micros) / 1_000_000).toFixed(2)}`;
}

export default function TasksScreen() {
  const { data, status, error, refresh } = useWorkspace();
  const { authorizedFetch } = useAuth();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [mediaFilter, setMediaFilter] = useState<TaskMediaFilter>('all');
  const [actionId, setActionId] = useState('');
  const [actionError, setActionError] = useState('');
  const tasks = data.tasks;
  const counts = useMemo(() => taskCounts(tasks), [tasks]);
  const mediaCounts = useMemo(() => taskMediaCounts(tasks), [tasks]);
  const visibleTasks = useMemo(
    () => filterTasksByMedia(filterWorkspaceTasks(tasks, filter), mediaFilter),
    [filter, mediaFilter, tasks],
  );
  const active = hasActiveTasks(tasks);
  const projectLabel =
    status === 'synced' || tasks.length > 0
      ? data.activeProject?.title ?? '未选择项目'
      : '当前项目';

  async function handleTaskAction(task: WorkspaceTask, action: 'cancel' | 'retry') {
    const projectId = data.activeProject?.id;
    if (!projectId || actionId) return;
    setActionId(task.id);
    setActionError('');
    try {
      if (action === 'cancel') {
        await cancelWorkspaceTask(
          workspaceApiBaseUrl,
          projectId,
          task.id,
          authorizedFetch,
          task.mediaKind,
        );
      } else {
        await retryWorkspaceTask(
          workspaceApiBaseUrl,
          projectId,
          task.id,
          authorizedFetch,
          task.mediaKind,
        );
      }
      refresh();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '任务操作失败');
    } finally {
      setActionId('');
    }
  }

  useFocusEffect(
    useCallback(() => {
      refresh();
      if (!active) return;
      const timer = setInterval(refresh, 8_000);
      return () => clearInterval(timer);
    }, [active, refresh]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="GENERATION"
          title="任务"
          left={<IconButton icon="arrow-left" label="返回 Agent" onPress={() => router.back()} />}
          right={
            <View style={styles.headerActions}>
              <IconButton
                icon="zap"
                label="生成画面"
                active
                onPress={() => router.push('/generate')}
              />
              <IconButton
                icon="refresh-cw"
                label="刷新任务"
                active={status === 'loading'}
                onPress={refresh}
              />
            </View>
          }
        />

        <View style={styles.filterBar} accessibilityRole="tablist">
          {FILTERS.map((item) => {
            const selected = filter === item.key;
            const count = counts[item.countKey];
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityLabel={`${item.label}，${count} 个任务`}
                accessibilityState={{ selected }}
                onPress={() => setFilter(item.key)}
                style={({ pressed }) => [
                  styles.filter,
                  selected && styles.filterActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterText, selected && styles.filterTextActive]}>
                  {item.label}
                </Text>
                {count > 0 ? (
                  <View style={[styles.filterCount, selected && styles.filterCountActive]}>
                    <Text
                      style={[
                        styles.filterCountText,
                        selected && styles.filterCountTextActive,
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.mediaFilterBar} accessibilityRole="tablist">
          {MEDIA_FILTERS.map((item) => {
            const selected = mediaFilter === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setMediaFilter(item.key)}
                style={({ pressed }) => [
                  styles.mediaFilter,
                  selected && styles.mediaFilterActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.mediaFilterText, selected && styles.mediaFilterTextActive]}>
                  {item.label}
                </Text>
                {item.key !== 'all' && mediaCounts[item.key] > 0 ? (
                  <Text style={[styles.mediaCount, selected && styles.mediaCountActive]}>
                    {mediaCounts[item.key]}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={status === 'loading'}
              onRefresh={refresh}
              tintColor={colors.textSecondary}
            />
          }
        >
          <Panel elevated style={styles.summary}>
            <View style={styles.summaryHead}>
              <View style={styles.summaryTitleWrap}>
                <Kicker>{projectLabel}</Kicker>
                <Text style={styles.summaryTitle}>{counts.total} 个生成任务</Text>
              </View>
              <View style={styles.syncState}>
                <StatusDot
                  color={
                    status === 'error'
                      ? colors.danger
                      : status === 'loading'
                        ? colors.info
                        : colors.success
                  }
                  pulse={status === 'loading'}
                />
                <Text style={styles.syncText}>{syncCopy(status)}</Text>
              </View>
            </View>
            <View style={styles.metricRow}>
              <Metric label="进行中" value={counts.active} color={colors.info} />
              <View style={styles.metricLine} />
              <Metric label="已完成" value={counts.done} color={colors.success} />
              <View style={styles.metricLine} />
              <Metric label="异常" value={counts.failed} color={colors.warning} />
            </View>
            {data.videoReadiness.totalShots > 0 ? (
              <Text style={styles.videoReadiness}>
                已采用视频 {data.videoReadiness.videoReady}/{data.videoReadiness.totalShots} 镜
                {' · '}缺首帧 {data.videoReadiness.missingFrame}
                {' · '}视频异常 {data.videoReadiness.failedTasks}
              </Text>
            ) : null}
          </Panel>

          {error ? (
            <Panel style={styles.errorCard}>
              <View style={styles.errorCopy}>
                <Feather name="wifi-off" size={17} color={colors.danger} />
                <View style={styles.errorTextWrap}>
                  <Text style={styles.errorTitle}>任务同步失败</Text>
                  <BodyText dim style={styles.errorText}>{error}</BodyText>
                </View>
              </View>
              <SecondaryButton label="重新同步" icon="refresh-cw" onPress={refresh} />
            </Panel>
          ) : null}
          {actionError ? (
            <Panel style={styles.errorCard}>
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.inlineActionError}>{actionError}</Text>
            </Panel>
          ) : null}

          <View style={styles.sectionHead}>
            <View>
              <Kicker>当前项目</Kicker>
              <Text style={styles.sectionTitle}>
                {filter === 'all' ? '全部任务' : FILTERS.find((item) => item.key === filter)?.label}
              </Text>
            </View>
            <MonoText>{visibleTasks.length} 项</MonoText>
          </View>

          {status === 'loading' && tasks.length === 0 ? (
            <Panel style={styles.stateCard}>
              <ActivityIndicator color={colors.textSecondary} />
              <Text style={styles.stateTitle}>正在同步任务</Text>
              <BodyText dim style={styles.stateText}>
                读取当前项目的生成记录。
              </BodyText>
            </Panel>
          ) : status === 'error' && tasks.length === 0 ? null : visibleTasks.length === 0 ? (
            <Panel style={styles.stateCard}>
              <View style={styles.stateIcon}>
                <Feather name="inbox" size={20} color={colors.textSecondary} />
              </View>
              <Text style={styles.stateTitle}>
                {tasks.length === 0 ? '还没有生成任务' : '这个筛选下没有任务'}
              </Text>
              <BodyText dim style={styles.stateText}>
                {tasks.length === 0
                  ? '在 Agent 中生成关键帧后，任务会出现在这里。'
                  : '切换到其他状态查看当前项目记录。'}
              </BodyText>
              {tasks.length === 0 ? (
                <SecondaryButton
                  label="生成画面"
                  icon="zap"
                  onPress={() => router.push('/generate')}
                />
              ) : null}
            </Panel>
          ) : (
            <Panel style={styles.taskList}>
              {visibleTasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  batch={data.batches.find((batch) => batch.id === task.batchId) ?? null}
                  projectId={data.activeProject?.id ?? ''}
                  actionId={actionId}
                  onAction={(action) => void handleTaskAction(task, action)}
                  divider={index < visibleTasks.length - 1}
                />
              ))}
            </Panel>
          )}
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function TaskRow({
  task,
  batch,
  projectId,
  actionId,
  onAction,
  divider,
}: {
  task: WorkspaceTask;
  batch: WorkspaceBatch | null;
  projectId: string;
  actionId: string;
  onAction: (action: 'cancel' | 'retry') => void;
  divider: boolean;
}) {
  const meta = STATUS_META[task.status];
  const mediaKind = task.mediaKind ?? 'image';
  const leadingIcon = mediaKind === 'video'
    ? 'film'
    : mediaKind === 'audio'
      ? 'volume-2'
      : 'image';
  const taskError = safeTaskError(task.error);
  const action =
    task.status === 'queued' || task.status === 'running'
      ? 'cancel'
      : task.status === 'failed' || task.status === 'canceled'
        ? 'retry'
        : null;
  return (
    <View>
      <Pressable
        accessibilityRole={task.assetId ? 'button' : 'text'}
        accessibilityLabel={
          task.assetId ? `查看${task.targetLabel}的生成版本` : task.targetLabel
        }
        accessibilityState={{ disabled: !task.assetId }}
        disabled={!task.assetId}
        onPress={() => {
          if (!task.assetId) return;
          router.push({
            pathname: '/review/[id]',
            params: {
              id: task.assetId,
              projectId,
              targetType: task.targetType,
              targetId: task.targetId,
              targetLabel: task.targetLabel,
              mediaKind,
            },
          });
        }}
        style={({ pressed }) => [styles.taskRow, pressed && styles.pressed]}
      >
        <View style={[styles.taskIcon, { backgroundColor: `${meta.color}12` }]}>
          <Feather name={leadingIcon} size={17} color={meta.color} />
        </View>
        <View style={styles.taskCopy}>
          <Text style={styles.taskTitle} numberOfLines={2}>
            {task.targetLabel}
          </Text>
          <View style={styles.taskMeta}>
            <Text style={styles.targetType}>
              {TARGET_LABELS[task.targetType]} · {taskMediaLabel(mediaKind)}
            </Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.taskTime}>{taskCreatedLabel(task.createdAt)}</Text>
          </View>
          {taskError ? (
            <Text style={styles.taskError} numberOfLines={2}>
              {taskError}
            </Text>
          ) : null}
          {batch ? (
            <Text style={styles.batchMeta} numberOfLines={1}>
              批次 · {BATCH_STATUS_LABELS[batch.status]} · 预留 {yuan(batch.reservedCostMicros)}
              {' · '}实付 {yuan(batch.actualCostMicros)}
            </Text>
          ) : null}
        </View>
        <View style={styles.taskRight}>
          <StatusBadge tone={meta.tone}>{taskStatusLabel(task.status)}</StatusBadge>
          <MonoText style={styles.taskDuration}>{taskDurationLabel(task)}</MonoText>
          {task.assetId ? <Text style={styles.reviewHint}>查看</Text> : null}
        </View>
      </Pressable>
      {action ? (
        <View style={styles.taskActionRow}>
          <SecondaryButton
            label={
              actionId === task.id
                ? action === 'cancel' ? '正在停止…' : '正在重试…'
                : action === 'cancel' ? '停止任务' : '重试生成'
            }
            icon={action === 'cancel' ? 'square' : 'refresh-cw'}
            disabled={Boolean(actionId)}
            onPress={() => onAction(action)}
            style={styles.taskActionButton}
          />
        </View>
      ) : null}
      {divider ? <Divider /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  filterBar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: 3,
  },
  mediaFilterBar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  mediaFilter: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  mediaFilterActive: {
    borderColor: 'rgba(92,117,111,0.35)',
    backgroundColor: 'rgba(92,117,111,0.08)',
  },
  mediaFilterText: {
    color: colors.textMuted,
    fontSize: type.micro,
    fontWeight: '500',
  },
  mediaFilterTextActive: {
    color: colors.info,
    fontWeight: '600',
  },
  mediaCount: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 9,
  },
  mediaCountActive: {
    color: colors.info,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  filter: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  filterActive: {
    backgroundColor: colors.elevated,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: type.label,
    fontWeight: '500',
  },
  filterTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  filterCount: {
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.overlay,
    paddingHorizontal: 4,
  },
  filterCountActive: {
    backgroundColor: colors.action,
  },
  filterCountText: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 9,
  },
  filterCountTextActive: {
    color: colors.actionInk,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  summary: {
    padding: spacing.md,
    gap: spacing.md,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: '600',
    lineHeight: 29,
  },
  syncState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 3,
  },
  syncText: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  metricRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    fontFamily: fonts.mono,
    fontSize: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  metricLine: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    backgroundColor: colors.lineStrong,
  },
  videoReadiness: {
    color: colors.textMuted,
    fontSize: type.micro,
    lineHeight: 17,
  },
  errorCard: {
    padding: spacing.sm,
    gap: spacing.sm,
    borderColor: 'rgba(184,78,68,0.24)',
    backgroundColor: 'rgba(184,78,68,0.04)',
  },
  errorCopy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  errorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  errorTitle: {
    color: colors.text,
    fontSize: type.label,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 2,
    fontSize: type.caption,
    lineHeight: 18,
  },
  inlineActionError: {
    flex: 1,
    color: colors.warningInk,
    fontSize: type.caption,
    lineHeight: 19,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  stateCard: {
    minHeight: 184,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xl,
  },
  stateIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
    marginBottom: 2,
  },
  stateTitle: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  stateText: {
    maxWidth: 250,
    textAlign: 'center',
    fontSize: type.caption,
    lineHeight: 19,
  },
  taskList: {
    overflow: 'hidden',
  },
  taskRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  taskActionRow: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  taskActionButton: {
    alignSelf: 'flex-end',
    minWidth: 132,
  },
  taskIcon: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  taskCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  taskTitle: {
    color: colors.text,
    fontSize: type.label,
    fontWeight: '600',
    lineHeight: 19,
  },
  taskMeta: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  targetType: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  taskTime: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  taskError: {
    marginTop: 5,
    color: colors.warningInk,
    fontSize: type.micro,
    lineHeight: 16,
  },
  batchMeta: {
    marginTop: 4,
    color: colors.info,
    fontFamily: fonts.mono,
    fontSize: 9,
  },
  taskRight: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  taskDuration: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  reviewHint: {
    color: colors.info,
    fontSize: type.micro,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.72,
  },
});
