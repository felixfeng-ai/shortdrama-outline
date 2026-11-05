import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { colors, radii, spacing, type } from '@/constants/tokens';
import { useAuth } from '@/lib/auth-store';
import {
  loadOverseasReviews,
  type OverseasReview,
} from '@/lib/overseas-review-api';
import { workspaceApiBaseUrl } from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';

export default function OverseasScreen() {
  const params = useLocalSearchParams<{ projectId?: string | string[] }>();
  const { data } = useWorkspace();
  const { authorizedFetch } = useAuth();
  const [reviews, setReviews] = useState<OverseasReview[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const linkedProjectId = Array.isArray(params.projectId)
    ? params.projectId[0]?.trim()
    : params.projectId?.trim();
  const projectId = linkedProjectId || data.activeProject?.id || '';
  const selected = reviews.find((item) => item.id === selectedId) ?? reviews[0] ?? null;

  const load = useCallback(() => {
    if (!projectId || !workspaceApiBaseUrl) {
      setLoading(false);
      setError(!projectId ? '当前还没有项目' : '尚未配置海外审片服务');
      return;
    }
    setLoading(true);
    setError('');
    void loadOverseasReviews(workspaceApiBaseUrl, projectId, authorizedFetch)
      .then((next) => {
        setReviews(next);
        setSelectedId((current) =>
          next.some((item) => item.id === current) ? current : next[0]?.id ?? ''
        );
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '海外审片读取失败');
      })
      .finally(() => setLoading(false));
  }, [authorizedFetch, projectId]);

  useEffect(load, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="OVERSEAS REVIEW"
          title="海外审片"
          left={<IconButton icon="arrow-left" label="返回 Agent" onPress={() => router.back()} />}
          right={<IconButton icon="refresh-cw" label="刷新海外审片" onPress={load} />}
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.title}>只审字幕、市场规则和阻断问题</Text>
            <BodyText dim>翻译与重新生成仍在 Web 本地化工作台完成。</BodyText>
          </View>

          {loading ? (
            <Panel style={styles.state}>
              <ActivityIndicator color={colors.info} />
              <BodyText dim>正在读取海外分支和最新审计。</BodyText>
            </Panel>
          ) : error ? (
            <Panel style={styles.state}>
              <Feather name="alert-circle" size={20} color={colors.warning} />
              <Text style={styles.stateTitle}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={load}>
                <Text style={styles.retry}>重试</Text>
              </Pressable>
            </Panel>
          ) : reviews.length === 0 ? (
            <Panel style={styles.state}>
              <Feather name="globe" size={22} color={colors.textSecondary} />
              <Text style={styles.stateTitle}>还没有海外分支</Text>
              <BodyText dim style={styles.center}>先在 Web 本地化工作台创建目标市场分支。</BodyText>
            </Panel>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.branchRail}>
                  {reviews.map((item) => {
                    const active = item.id === selected?.id;
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        onPress={() => setSelectedId(item.id)}
                        style={[styles.branchChip, active && styles.branchChipActive]}
                      >
                        <Text style={[styles.branchText, active && styles.branchTextActive]}>
                          {item.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {selected ? (
                <>
                  <Panel style={styles.summary}>
                    <View style={styles.summaryHead}>
                      <View style={styles.summaryCopy}>
                        <Kicker>{selected.locale}</Kicker>
                        <Text style={styles.summaryTitle}>{selected.marketLabel}</Text>
                      </View>
                      <StatusBadge tone={selected.audit.blocking > 0 ? 'danger' : selected.audit.warning > 0 ? 'warning' : 'success'}>
                        {selected.audit.blocking > 0
                          ? `${selected.audit.blocking} 个阻断`
                          : selected.audit.warning > 0
                            ? `${selected.audit.warning} 个提醒`
                            : '审计通过'}
                      </StatusBadge>
                    </View>
                    <View style={styles.ruleGrid}>
                      <Rule label="字幕上限" value={`${selected.subtitleMaxLineChars} 字`} />
                      <Rule label="字幕速度" value={`${selected.subtitleMaxCps} CPS`} />
                    </View>
                  </Panel>

                  <Panel style={styles.rules}>
                    <Kicker>目标平台</Kicker>
                    <Text style={styles.ruleValue}>{selected.platforms.join(' · ') || '未配置平台'}</Text>
                    <View style={styles.divider} />
                    <Kicker>文化适配</Kicker>
                    <Text style={styles.ruleValue}>
                      {[...selected.visualRules, ...selected.redlines].join('；') || '未配置文化规则'}
                    </Text>
                  </Panel>

                  <View style={styles.issues}>
                    <View style={styles.issueHead}>
                      <Text style={styles.sectionTitle}>审计问题</Text>
                      <Text style={styles.issueCount}>{selected.audit.issues.length} 项</Text>
                    </View>
                    {selected.audit.issues.length === 0 ? (
                      <Panel style={styles.state}>
                        <Feather name="check-circle" size={20} color={colors.success} />
                        <Text style={styles.stateTitle}>最新审计没有发现问题</Text>
                      </Panel>
                    ) : (
                      selected.audit.issues.map((issue, index) => (
                        <Panel key={`${issue.code}-${index}`} style={styles.issue}>
                          <View style={styles.issueTop}>
                            <Text style={styles.issueEpisode}>
                              {issue.episode > 0 ? `第 ${issue.episode} 集` : '全局'}
                            </Text>
                            <StatusBadge tone={issue.severity === 'blocking' ? 'danger' : 'warning'}>
                              {issue.severity === 'blocking' ? '阻断' : '提醒'}
                            </StatusBadge>
                          </View>
                          <Text style={styles.issueMessage}>{issue.message}</Text>
                          {issue.evidence ? (
                            <Text style={styles.issueEvidence}>证据：{issue.evidence}</Text>
                          ) : null}
                          <Text style={styles.issueSuggestion}>{issue.suggestion}</Text>
                        </Panel>
                      ))
                    )}
                  </View>
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rule}>
      <Text style={styles.ruleLabel}>{label}</Text>
      <Text style={styles.ruleNumber}>{value}</Text>
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
  state: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.xl },
  stateTitle: { color: colors.text, fontSize: type.body, fontWeight: '600', textAlign: 'center' },
  center: { textAlign: 'center', maxWidth: 280 },
  retry: { color: colors.info, fontSize: type.caption, fontWeight: '600' },
  branchRail: { flexDirection: 'row', gap: spacing.xs },
  branchChip: {
    minHeight: 42,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  branchChipActive: { borderColor: colors.action, backgroundColor: colors.action },
  branchText: { color: colors.textSecondary, fontSize: type.caption },
  branchTextActive: { color: colors.actionInk, fontWeight: '600' },
  summary: { padding: spacing.md, gap: spacing.sm },
  summaryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  summaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  summaryTitle: { color: colors.text, fontSize: type.bodyLarge, fontWeight: '600' },
  ruleGrid: { flexDirection: 'row', gap: spacing.md },
  rule: { flex: 1, gap: 2 },
  ruleLabel: { color: colors.textMuted, fontSize: type.micro },
  ruleNumber: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  rules: { padding: spacing.md, gap: spacing.xs },
  ruleValue: { color: colors.textSecondary, fontSize: type.caption, lineHeight: 19 },
  divider: { height: 1, marginVertical: spacing.xs, backgroundColor: colors.line },
  issues: { gap: spacing.sm },
  issueHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: type.bodyLarge, fontWeight: '600' },
  issueCount: { color: colors.textMuted, fontSize: type.caption },
  issue: { padding: spacing.md, gap: spacing.xs },
  issueTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  issueEpisode: { color: colors.textMuted, fontSize: type.micro },
  issueMessage: { color: colors.text, fontSize: type.body, fontWeight: '600', lineHeight: 22 },
  issueEvidence: { color: colors.textMuted, fontSize: type.caption, lineHeight: 18 },
  issueSuggestion: { color: colors.textSecondary, fontSize: type.caption, lineHeight: 19 },
});
