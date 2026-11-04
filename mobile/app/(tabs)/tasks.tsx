import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SceneFrame } from '@/components/scene-frame';
import {
  BodyText,
  Divider,
  IconButton,
  Kicker,
  MonoText,
  Panel,
  PrimaryButton,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
  StatusBadge,
  StatusDot,
} from '@/components/ui';
import { GENERATION_TASKS, REVIEW_VERSIONS, taskCountByState } from '@/lib/app-data';
import { colors, fonts, spacing, type } from '@/constants/tokens';

const FILTERS = ['待审', '运行中', '已完成'] as const;

export default function TasksScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="GENERATION"
          title="任务"
          left={<IconButton icon="arrow-left" label="返回 Agent" onPress={() => router.back()} />}
          right={<IconButton icon="sliders" label="任务筛选" />}
        />

        <View style={styles.filterBar} accessibilityRole="tablist">
          {FILTERS.map((filter, index) => (
            <Pressable
              key={filter}
              accessibilityRole="tab"
              accessibilityState={{ selected: index === 0 }}
              style={({ pressed }) => [
                styles.filter,
                index === 0 && styles.filterActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterText, index === 0 && styles.filterTextActive]}>
                {filter}
              </Text>
              {index === 0 ? (
                <View style={styles.filterCount}>
                  <Text style={styles.filterCountText}>{taskCountByState('needs-review')}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionHead}>
            <View>
              <Kicker>待你确认</Kicker>
              <Text style={styles.sectionTitle}>第 17 镜 · 首帧</Text>
            </View>
            <StatusBadge tone="warning">2 个版本</StatusBadge>
          </View>

          <Panel elevated style={styles.reviewCard}>
              <View style={styles.reviewBody}>
                <SceneFrame style={styles.reviewFrame} />
                <View style={styles.reviewCopy}>
                  <View style={styles.liveLine}>
                    <StatusDot color={colors.success} />
                    <Text style={styles.liveText}>导演版 V3 · 21:08</Text>
                  </View>
                  <Text style={styles.reviewTitle}>雨夜码头</Text>
                  <Text style={styles.reviewMeta}>EP03 · 第 17 镜 · 近景 · 9:16</Text>
                  <View style={styles.reviewStat}>
                    <Kicker>一致性</Kicker>
                    <Text style={styles.reviewStatValue}>86%</Text>
                  </View>
                  <View style={styles.versionRow}>
                    {REVIEW_VERSIONS.map((version) => (
                      <View
                        key={version.id}
                        style={[styles.versionChip, version.selected && styles.versionChipActive]}
                      >
                        <Text
                          style={[
                            styles.versionChipText,
                            version.selected && styles.versionChipTextActive,
                          ]}
                        >
                          {version.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
              <Divider />
              <View style={styles.reviewActions}>
                <SecondaryButton label="退回重做" icon="rotate-ccw" style={styles.flexButton} />
                <PrimaryButton
                  label="进入审片"
                  icon="maximize"
                  onPress={() => router.push('/review/shot-17')}
                  style={styles.flexButton}
                />
              </View>
          </Panel>

          <View style={styles.sectionHead}>
            <View>
              <Kicker>最近任务</Kicker>
              <Text style={styles.sectionTitle}>生成队列</Text>
            </View>
            <MonoText>{GENERATION_TASKS.length} 项</MonoText>
          </View>

          <Panel style={styles.taskList}>
            {GENERATION_TASKS.map((task, index) => (
              <View key={task.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`查看${task.title}`}
                  style={({ pressed }) => [styles.taskRow, pressed && styles.pressed]}
                >
                  <View
                    style={[
                      styles.taskIcon,
                      task.state === 'failed' && styles.taskIconFailed,
                      task.state === 'running' && styles.taskIconRunning,
                    ]}
                  >
                    <Feather
                      name={
                        task.state === 'needs-review'
                          ? 'eye'
                          : task.state === 'running'
                            ? 'loader'
                            : task.state === 'failed'
                              ? 'alert-circle'
                              : 'check'
                      }
                      size={17}
                      color={
                        task.state === 'failed'
                          ? colors.warning
                          : task.state === 'running'
                            ? colors.info
                            : colors.textSecondary
                      }
                    />
                  </View>
                  <View style={styles.taskCopy}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <Text style={styles.taskTarget}>{task.target}</Text>
                  </View>
                  <View style={styles.taskRight}>
                    <Text style={styles.taskCost}>{task.cost}</Text>
                    <Text style={styles.taskElapsed}>{task.elapsed}</Text>
                  </View>
                </Pressable>
                {index < GENERATION_TASKS.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Panel>

          <Panel style={styles.tipCard}>
            <Feather name="info" size={16} color={colors.info} />
            <BodyText dim style={styles.tipText}>
              失败任务不会重复扣费。重试会创建新的任务记录，并保留原失败原因。
            </BodyText>
          </Panel>
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: 3,
  },
  filter: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 6,
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
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: colors.warning,
  },
  filterCountText: {
    color: colors.canvas,
    fontFamily: fonts.mono,
    fontSize: 9,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
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
  reviewCard: {
    overflow: 'hidden',
  },
  reviewBody: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  reviewFrame: {
    width: 142,
    flexShrink: 0,
  },
  reviewCopy: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  liveLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveText: {
    color: colors.textSecondary,
    fontSize: type.micro,
  },
  reviewTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '600',
    lineHeight: 26,
  },
  reviewMeta: {
    color: colors.textMuted,
    fontSize: type.caption,
    lineHeight: 18,
  },
  reviewStat: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  reviewStatValue: {
    color: colors.action,
    fontFamily: fonts.mono,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  versionRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 'auto',
  },
  versionChip: {
    minWidth: 38,
    minHeight: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.line,
  },
  versionChipActive: {
    borderColor: 'rgba(184,101,79,0.35)',
    backgroundColor: colors.accentSoft,
  },
  versionChipText: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.micro,
  },
  versionChipTextActive: {
    color: colors.action,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  flexButton: {
    flex: 1,
  },
  taskList: {
    overflow: 'hidden',
  },
  taskRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  taskIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.elevated,
  },
  taskIconFailed: {
    backgroundColor: 'rgba(184,101,79,0.1)',
  },
  taskIconRunning: {
    backgroundColor: 'rgba(92,117,111,0.1)',
  },
  taskCopy: {
    flex: 1,
    minWidth: 0,
  },
  taskTitle: {
    color: colors.text,
    fontSize: type.label,
    fontWeight: '600',
  },
  taskTarget: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: type.micro,
  },
  taskRight: {
    alignItems: 'flex-end',
  },
  taskCost: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: type.caption,
  },
  taskElapsed: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.micro,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: 'rgba(92,117,111,0.06)',
  },
  tipText: {
    flex: 1,
    fontSize: type.caption,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.72,
  },
});

