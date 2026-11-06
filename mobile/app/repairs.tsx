import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
  Panel,
  ScreenFade,
  ScreenHeader,
  StatusBadge,
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import { useAuth } from '@/lib/auth-store';
import {
  fetchProjectReviewComments,
  resolveReviewComment,
  timecodeLabel,
  type ReviewComment,
} from '@/lib/review-comments-api';
import {
  repairQueueCounts,
  repairQueueItems,
  type RepairQueueFilter,
} from '@/lib/repair-queue';
import { workspaceApiBaseUrl } from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';

export default function RepairQueueScreen() {
  const { data, selectedProjectId, status } = useWorkspace();
  const { authorizedFetch } = useAuth();
  const [filter, setFilter] = useState<RepairQueueFilter>('repair');
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const projectId = selectedProjectId ?? data.activeProject?.id ?? '';

  const load = useCallback(() => {
    if (!projectId) {
      setComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    void fetchProjectReviewComments(workspaceApiBaseUrl, projectId, authorizedFetch)
      .then(setComments)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : '返修队列读取失败');
      })
      .finally(() => setLoading(false));
  }, [authorizedFetch, projectId]);

  useFocusEffect(load);

  const visible = useMemo(() => repairQueueItems(comments, filter), [comments, filter]);
  const counts = useMemo(() => repairQueueCounts(comments), [comments]);

  async function resolve(comment: ReviewComment) {
    if (!projectId || busyId) return;
    setBusyId(comment.id);
    setError('');
    try {
      const updated = await resolveReviewComment(
        workspaceApiBaseUrl,
        projectId,
        comment.id,
        authorizedFetch,
      );
      setComments((current) =>
        current.map((item) => item.id === updated.id ? updated : item)
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '状态更新失败');
    } finally {
      setBusyId('');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <ScreenHeader
          kicker="SHOT QUEUE"
          title="返修队列"
          left={<IconButton icon="arrow-left" label="返回现场检查" onPress={() => router.back()} />}
          right={<IconButton icon="refresh-cw" label="刷新队列" active={loading} onPress={load} />}
        />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.title}>只看需要回到镜头处理的问题</Text>
            <BodyText dim>
              退回和定稿都来自同一项目批注，Web 与 App 看到的是同一份镜头记录。
            </BodyText>
          </View>

          <View style={styles.tabs} accessibilityRole="tablist">
            <QueueTab
              active={filter === 'repair'}
              count={counts.repair}
              icon="corner-up-left"
              label="待返修"
              onPress={() => setFilter('repair')}
            />
            <QueueTab
              active={filter === 'final'}
              count={counts.final}
              icon="check-square"
              label="待定稿"
              onPress={() => setFilter('final')}
            />
          </View>

          {status === 'loading' || loading ? (
            <Panel style={styles.state}>
              <ActivityIndicator color={colors.info} />
              <Text style={styles.stateTitle}>正在同步镜头记录</Text>
            </Panel>
          ) : error ? (
            <Panel style={styles.error}>
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={load}>
                <Text style={styles.retry}>重试</Text>
              </Pressable>
            </Panel>
          ) : !projectId ? (
            <Panel style={styles.state}>
              <Text style={styles.stateTitle}>先选择一个项目</Text>
              <BodyText dim>返修队列按当前项目读取。</BodyText>
            </Panel>
          ) : visible.length === 0 ? (
            <Panel style={styles.state}>
              <View style={styles.stateIcon}>
                <Feather name="check-circle" size={20} color={colors.success} />
              </View>
              <Text style={styles.stateTitle}>
                {filter === 'repair' ? '没有待返修镜头' : '没有待定稿镜头'}
              </Text>
              <BodyText dim>
                {filter === 'repair'
                  ? '审片退回或现场检查写入返修后，会出现在这里。'
                  : '在审片页标记定稿后，会出现在这里。'}
              </BodyText>
            </Panel>
          ) : (
            <View style={styles.list}>
              {visible.map((comment) => (
                <Panel key={comment.id} style={styles.row}>
                  <View style={styles.rowHead}>
                    <View style={styles.rowTitleWrap}>
                      <Kicker>
                        {filter === 'repair' ? 'RETURN' : 'FINAL'}
                        {comment.timecodeMs !== null ? ` · ${timecodeLabel(comment.timecodeMs)}` : ''}
                      </Kicker>
                      <Text numberOfLines={1} style={styles.rowTitle}>{comment.targetName}</Text>
                    </View>
                    <StatusBadge tone={filter === 'repair' ? 'warning' : 'info'}>
                      {filter === 'repair' ? '待返修' : '待定稿'}
                    </StatusBadge>
                  </View>
                  <Text style={styles.body}>{comment.body}</Text>
                  <Text style={styles.time}>
                    {new Date(comment.createdAt).toLocaleString('zh-CN', { hour12: false })}
                  </Text>
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void resolve(comment)}
                      style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                    >
                      <Feather name="check" size={14} color={colors.textSecondary} />
                      <Text style={styles.secondaryText}>
                        {busyId === comment.id ? '保存中…' : '已处理'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push({
                        pathname: '/review/[id]',
                        params: {
                          id: comment.targetId,
                          projectId,
                          targetType: 'shot',
                          targetId: comment.targetId,
                          targetLabel: comment.targetName,
                          mediaKind: 'video',
                        },
                      })}
                      style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                    >
                      <Feather name="film" size={14} color={colors.actionInk} />
                      <Text style={styles.primaryText}>打开镜头</Text>
                    </Pressable>
                  </View>
                </Panel>
              ))}
            </View>
          )}
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

function QueueTab({
  active,
  count,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  count: number;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
    >
      <Feather name={icon} size={15} color={active ? colors.text : colors.textMuted} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      <Text style={[styles.tabCount, active && styles.tabCountActive]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  intro: { gap: spacing.xs },
  title: { color: colors.text, fontSize: type.title, fontWeight: '600', lineHeight: 29 },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  tab: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 6,
  },
  tabActive: { backgroundColor: colors.elevated },
  tabText: { color: colors.textMuted, fontSize: type.caption, fontWeight: '500' },
  tabTextActive: { color: colors.text, fontWeight: '600' },
  tabCount: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.micro,
  },
  tabCountActive: { color: colors.textSecondary },
  state: {
    minHeight: 190,
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
    backgroundColor: 'rgba(112,128,107,0.1)',
  },
  stateTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  error: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderColor: 'rgba(184,78,68,0.24)',
    backgroundColor: 'rgba(184,78,68,0.04)',
  },
  errorText: { flex: 1, color: colors.warningInk, fontSize: type.caption, lineHeight: 18 },
  retry: { color: colors.info, fontSize: type.caption, fontWeight: '600' },
  list: { gap: spacing.sm },
  row: { gap: spacing.xs, padding: spacing.md },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowTitleWrap: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  body: { color: colors.textSecondary, fontSize: type.caption, lineHeight: 20 },
  time: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: type.micro },
  actions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xxs },
  secondary: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
  },
  secondaryText: { color: colors.textSecondary, fontSize: type.caption, fontWeight: '600' },
  primary: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    backgroundColor: colors.action,
  },
  primaryText: { color: colors.actionInk, fontSize: type.caption, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
