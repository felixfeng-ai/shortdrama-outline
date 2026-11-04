import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { REVIEW_VERSIONS } from '@/lib/app-data';
import { colors, fonts, spacing, type } from '@/constants/tokens';

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shotNumber = Number(String(id).match(/\d+/)?.[0] ?? 17);
  const [selectedVersion, setSelectedVersion] = useState('v3');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <View style={styles.topBar}>
          <IconButton icon="arrow-left" label="返回任务" onPress={() => router.back()} />
          <View style={styles.topCopy}>
            <Kicker>REVIEW / EP03 · {shotNumber}</Kicker>
            <Text style={styles.topTitle}>第 {shotNumber} 镜首帧</Text>
          </View>
          <IconButton icon="share-2" label="分享审片链接" />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.frameWrap}>
            <SceneFrame style={styles.frame} />
          </View>

          <View style={styles.versionHead}>
            <View>
              <Kicker>版本</Kicker>
              <Text style={styles.sectionTitle}>导演版 V3</Text>
            </View>
            <View style={styles.versionMeta}>
              <StatusBadge tone="warning">待确认</StatusBadge>
              <Text style={styles.consistency}>一致性 86%</Text>
            </View>
          </View>

          <View style={styles.versionRail}>
            {REVIEW_VERSIONS.map((version) => {
              const selected = selectedVersion === version.id;
              return (
                <Pressable
                  key={version.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedVersion(version.id)}
                  style={({ pressed }) => [
                    styles.versionCard,
                    selected && styles.versionCardSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.versionLabel, selected && styles.versionLabelSelected]}>
                    {version.label}
                  </Text>
                  <Text numberOfLines={1} style={styles.versionSource}>{version.source}</Text>
                </Pressable>
              );
            })}
          </View>

          <Panel style={styles.detailCard}>
            <View style={styles.detailHead}>
              <Kicker>画面判断</Kicker>
              <MonoText>9:16 · 720 × 1280</MonoText>
            </View>
            <Divider />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>景别</Text>
              <Text style={styles.detailValue}>近景</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>角色锚点</Text>
              <Text style={styles.detailValue}>苏婉 · 林昭</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>视觉宪法</Text>
              <Text style={styles.detailValue}>雨夜冷调 · 低照度</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>来源任务</Text>
              <Text style={styles.detailValue}>任务 {id} · 00:48</Text>
            </View>
          </Panel>

          <Panel style={styles.noteCard}>
            <View style={styles.noteHead}>
              <View style={styles.noteIcon}>
                <Feather name="message-square" size={15} color={colors.info} />
              </View>
              <Text style={styles.noteTitle}>场记批注</Text>
            </View>
            <BodyText>
              雨量比上一镜更密，人物轮廓仍清楚。若保留这一版，建议把第 18 镜的环境雨量降低 20%，避免跳变。
            </BodyText>
          </Panel>
        </ScrollView>

        <View style={styles.footer}>
          <SecondaryButton label="退回重做" icon="rotate-ccw" style={styles.footerButton} />
          <PrimaryButton
            label="采用这版"
            icon="check"
            onPress={() => router.back()}
            style={styles.footerButton}
          />
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
  topBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  topTitle: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  frameWrap: {
    position: 'relative',
    width: '100%',
    maxWidth: 310,
    alignSelf: 'center',
  },
  frame: {
    width: '100%',
  },
  versionHead: {
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
  consistency: {
    color: colors.action,
    fontFamily: fonts.mono,
    fontSize: type.caption,
  },
  versionMeta: {
    alignItems: 'flex-end',
    gap: 5,
  },
  versionRail: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  versionCard: {
    minHeight: 58,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  versionCardSelected: {
    borderColor: 'rgba(184,101,79,0.36)',
    backgroundColor: colors.accentSoft,
  },
  versionLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: type.label,
    fontWeight: '600',
  },
  versionLabelSelected: {
    color: colors.action,
  },
  versionSource: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  detailCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
  },
  detailRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: type.caption,
  },
  detailValue: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: type.caption,
    textAlign: 'right',
  },
  noteCard: {
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: 'rgba(92,117,111,0.06)',
  },
  noteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  noteIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: 'rgba(92,117,111,0.1)',
  },
  noteTitle: {
    color: colors.text,
    fontSize: type.label,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});

