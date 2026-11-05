import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  IconButton,
  Kicker,
  ScreenFade,
  ScreenHeader,
} from '@/components/ui';
import { colors, radii, spacing, type } from '@/constants/tokens';
import { useWorkspace } from '@/lib/workspace-store';

type IconName = keyof typeof Feather.glyphMap;

interface Capability {
  title: string;
  description: string;
  href:
    | '/generate'
    | '/generate?mode=video'
    | '/draft'
    | '/tasks'
    | '/continuity'
    | '/pacing'
    | '/overseas'
    | '/projects';
  icon: IconName;
}

const CAPABILITIES: Capability[] = [
  {
    title: '生成画面',
    description: '生成定妆图、场景图和镜头首帧',
    href: '/generate',
    icon: 'image',
  },
  {
    title: '生成镜头视频',
    description: '从已采用首帧出视频，不足时可直接补首帧',
    href: '/generate?mode=video',
    icon: 'video',
  },
  {
    title: '整集草片',
    description: '按集检查准备率、预算与缺首帧镜头',
    href: '/draft',
    icon: 'film',
  },
  {
    title: '任务与审片',
    description: '查看进度、失败重试、采用版本与批注',
    href: '/tasks',
    icon: 'check-square',
  },
  {
    title: '现场连续性',
    description: '拍照核对现场和当前镜头是否一致',
    href: '/continuity',
    icon: 'camera',
  },
  {
    title: '节奏分析',
    description: '检查钩子、对白密度和平均镜头时长',
    href: '/pacing',
    icon: 'activity',
  },
  {
    title: '海外审片',
    description: '检查字幕长度、文化适配和海外分支',
    href: '/overseas',
    icon: 'globe',
  },
  {
    title: '项目与同步',
    description: '切换项目、新建、导入和查看同步状态',
    href: '/projects',
    icon: 'folder',
  },
];

export default function CapabilitiesScreen() {
  const { data } = useWorkspace();
  const readiness = data.videoReadiness;
  const project = data.activeProject;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <ScreenHeader
          kicker="CAPABILITIES"
          title="能做什么"
          left={<IconButton icon="arrow-left" label="返回 Veya Agent" onPress={() => router.back()} />}
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Kicker>当前项目</Kicker>
            <Text style={styles.project}>{project?.title ?? '还没有项目'}</Text>
            <BodyText dim>
              {project
                ? `${readiness.totalShots} 个视频镜头 · 首帧就绪 ${readiness.frameReady} · 缺首帧 ${readiness.missingFrame}`
                : '创建或载入项目后，这里会显示真实的可生成镜头与任务状态。'}
            </BodyText>
          </View>

          <View style={styles.list}>
            {CAPABILITIES.map((item) => (
              <Pressable
                key={item.title}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}：${item.description}`}
                onPress={() => router.push(item.href)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.icon}>
                  <Feather name={item.icon} size={18} color={colors.textSecondary} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                </View>
                <Feather name="chevron-right" size={17} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
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
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  intro: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  project: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: '600',
    lineHeight: 28,
  },
  list: {
    marginTop: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontSize: type.caption,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.72,
  },
});
