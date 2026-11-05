import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import type { WorkspacePacingRow } from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';

function rowTone(row: WorkspacePacingRow) {
  return row.observations.length === 0 ? 'success' : 'warning';
}

function suspenseLabel(value: WorkspacePacingRow['endingSuspense']): string {
  if (value === 'open') return '未完成动作';
  if (value === 'resolved') return '已解决';
  if (value === 'short') return '过短';
  return '缺失';
}

export default function PacingScreen() {
  const { data, status, refresh } = useWorkspace();
  const report = data.pacing;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="EPISODE PACING"
          title="按集节奏"
          left={<IconButton icon="arrow-left" label="返回 Agent" onPress={() => router.back()} />}
          right={<IconButton icon="refresh-cw" label="刷新节奏分析" onPress={refresh} />}
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.title}>{report.summary}</Text>
            <BodyText dim>
              对比 {report.benchmark.label}：钩子 {report.benchmark.hookMinChars}-
              {report.benchmark.hookMaxChars} 字，单镜对白不超过{' '}
              {report.benchmark.dialogueCharsPerShotMax} 字。
            </BodyText>
          </View>

          {status === 'loading' ? (
            <Panel style={styles.empty}>
              <BodyText dim>正在读取分集与分镜。</BodyText>
            </Panel>
          ) : report.rows.length === 0 ? (
            <Panel style={styles.empty}>
              <Feather name="activity" size={22} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>还没有分集可分析</Text>
              <BodyText dim style={styles.center}>先在项目里完成分集和分镜，再回来检查节奏。</BodyText>
            </Panel>
          ) : (
            <View style={styles.rows}>
              {report.rows.map((row) => (
                <Panel key={row.episode} style={styles.row}>
                  <View style={styles.rowHead}>
                    <View style={styles.rowTitleCopy}>
                      <Kicker>第 {row.episode} 集</Kicker>
                      <Text style={styles.rowTitle}>{row.title || '未命名分集'}</Text>
                    </View>
                    <StatusBadge tone={rowTone(row)}>
                      {row.observations.length ? `${row.observations.length} 个提醒` : '节奏正常'}
                    </StatusBadge>
                  </View>
                  <View style={styles.metricGrid}>
                    <Metric label="钩子长度" value={`${row.hookChars} 字`} />
                    <Metric label="集尾悬念" value={suspenseLabel(row.endingSuspense)} />
                    <Metric label="对白密度" value={`${row.dialogueCharsPerShot} 字/镜`} />
                    <Metric label="平均镜头" value={`${row.averageShotSeconds} 秒`} />
                    <Metric label="镜头数" value={`${row.shotCount} 镜`} wide />
                  </View>
                  {row.observations.length > 0 ? (
                    <View style={styles.observations}>
                      {row.observations.map((item) => (
                        <View key={item} style={styles.observation}>
                          <View style={styles.dot} />
                          <Text style={styles.observationText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Panel>
              ))}
            </View>
          )}
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.metric, wide && styles.metricWide]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  center: { textAlign: 'center', maxWidth: 280 },
  rows: { gap: spacing.sm },
  row: { padding: spacing.md, gap: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowTitleCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { color: colors.text, fontSize: type.bodyLarge, fontWeight: '600' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  metric: { width: '50%', gap: 2, paddingRight: spacing.xs },
  metricWide: { width: '100%' },
  metricLabel: { color: colors.textMuted, fontSize: type.micro },
  metricValue: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  observations: { gap: 6, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  observation: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  dot: { width: 5, height: 5, marginTop: 7, borderRadius: 3, backgroundColor: colors.warning },
  observationText: { flex: 1, color: colors.textSecondary, fontSize: type.caption, lineHeight: 18 },
});
