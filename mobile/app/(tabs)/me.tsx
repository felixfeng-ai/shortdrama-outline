import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  BrandMark,
  Divider,
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
import { colors, fonts, spacing, type } from '@/constants/tokens';
import { useAuth } from '@/lib/auth-store';
import {
  initializeAnalytics,
  setAnalyticsEnabled,
} from '@/lib/analytics-service';
import {
  applyAppUpdate,
  checkInternalUpdate,
  type AppUpdateState,
} from '@/lib/app-updates';
import {
  disableNativeNotifications,
  enableNativeNotifications,
  notificationPermission,
} from '@/lib/native-notifications';
import {
  quotaCostLabel,
  quotaPresetRows,
  quotaPriceVersionLabel,
  quotaProjectLabel,
} from '@/lib/quota-view';
import { useWorkspace } from '@/lib/workspace-store';

export default function MeScreen() {
  const { status: authStatus, user, logout, authorizedFetch } = useAuth();
  const { data } = useWorkspace();
  const [notificationState, setNotificationState] = useState<
    'checking' | 'granted' | 'denied' | 'idle' | 'loading' | 'error' | 'unsupported'
  >('checking');
  const [pushToken, setPushToken] = useState('');
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [updateState, setUpdateState] = useState<AppUpdateState>({
    status: 'idle',
    message: '与内测通道同步',
  });
  const quota = data.quota;
  const quotaPresets = quotaPresetRows(quota);
  const progress = quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;
  useEffect(() => {
    let active = true;
    void notificationPermission()
      .then((permission) => {
        if (active) {
          setNotificationState(
            permission === 'granted'
              ? 'granted'
              : permission === 'unsupported'
                ? 'unsupported'
                : 'idle',
          );
        }
      })
      .catch(() => {
        if (active) setNotificationState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void initializeAnalytics().then(setAnalyticsOn);
  }, []);

  async function onEnableNotifications() {
    if (notificationState === 'loading') return;
    try {
      if (notificationState === 'granted' && pushToken) {
        setNotificationState('loading');
        await disableNativeNotifications(pushToken, authorizedFetch);
        setPushToken('');
        setNotificationState('idle');
        return;
      }
      setNotificationState('loading');
      const result = await enableNativeNotifications(authorizedFetch);
      setPushToken(result.token);
      setNotificationState('granted');
    } catch {
      setNotificationState('error');
    }
  }

  async function onCheckUpdate() {
    if (updateState.status === 'checking') return;
    if (updateState.status === 'ready') {
      Alert.alert(
        '重启应用更新',
        '更新已经下载，重启后生效。',
        [
          { text: '稍后', style: 'cancel' },
          {
            text: '立即重启',
            onPress: () => {
              void applyAppUpdate().catch(() => {
                setUpdateState({
                  status: 'error',
                  message: '重启更新失败，请关闭 App 后重试',
                });
              });
            },
          },
        ],
      );
      return;
    }
    setUpdateState({ status: 'checking', message: '正在检查内测更新…' });
    const next = await checkInternalUpdate();
    setUpdateState(next);
    if (next.status === 'ready') {
      Alert.alert(
        '新版本已下载',
        '重启应用后生效。',
        [
          { text: '稍后', style: 'cancel' },
          { text: '立即重启', onPress: () => void applyAppUpdate() },
        ],
      );
    }
  }

  const notificationValue =
    notificationState === 'loading'
      ? '正在设置…'
      : notificationState === 'granted'
        ? '已开启 · 点击关闭'
        : notificationState === 'error'
          ? '设置失败 · 点击重试'
          : notificationState === 'unsupported'
            ? '仅 iOS / Android 构建可用'
          : '任务 · 审片 · 额度';
  const settings = [
    {
      key: 'updates',
      icon: 'refresh-cw',
      label: '检查内测更新',
      value: updateState.message,
      onPress: () => void onCheckUpdate(),
    },
    {
      key: 'feedback',
      icon: 'message-square',
      label: '内测反馈',
      value: '问题、版本与设备信息',
      onPress: () => router.push('/feedback'),
    },
    {
      key: 'notifications',
      icon: 'bell',
      label: '通知与提醒',
      value: notificationValue,
      onPress: onEnableNotifications,
    },
    {
      key: 'devices',
      icon: 'smartphone',
      label: '已登录设备',
      value: '当前设备',
      onPress: () => router.push('/account/sessions'),
    },
    {
      key: 'billing',
      icon: 'credit-card',
      label: '订阅与额度',
      value: `${quota.remaining} / ${quota.limit} 单位`,
      onPress: () => router.push('/account/billing'),
    },
    {
      key: 'privacy',
      icon: 'shield',
      label: '隐私与数据',
      value: '导出、注销与数据说明',
      onPress: () => router.push('/account/data'),
    },
    {
      key: 'legal',
      icon: 'file-text',
      label: '法律与 AI 说明',
      value: '隐私 · 条款 · 生成标识',
      onPress: () => router.push('/legal'),
    },
    {
      key: 'report',
      icon: 'flag',
      label: '内容举报',
      value: '侵权、违法与不当内容',
      onPress: () => router.push('/report'),
    },
    {
      key: 'analytics',
      icon: 'activity',
      label: '匿名体验分析',
      value: analyticsOn ? '已开启 · 不采集创作正文' : '已关闭',
      onPress: () => {
        const next = !analyticsOn;
        setAnalyticsOn(next);
        void setAnalyticsEnabled(next);
      },
    },
    { key: 'ai-label', icon: 'file-text', label: 'AI 内容标识', value: '导出时自动附加' },
  ] as const;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="ACCOUNT"
          title="我的"
          left={<IconButton icon="arrow-left" label="返回 Agent" onPress={() => router.back()} />}
          right={
            <StatusBadge tone={authStatus === 'authenticated' ? 'success' : 'neutral'}>
              {authStatus === 'authenticated' ? '已登录' : '匿名会话'}
            </StatusBadge>
          }
        />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Panel elevated style={styles.accountCard}>
            <View style={styles.avatar}>
              <BrandMark size={42} />
            </View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountTitle}>
                {user ? user.email || user.displayName : '登录后跨设备同步'}
              </Text>
              <BodyText dim>
                {user
                  ? '已与 Web 共用同一账号、项目和额度。退出后回到当前设备匿名工作区。'
                  : '当前工作区按匿名会话保存。使用与 Web 相同的邮箱验证码登录后可跨设备继续。'}
              </BodyText>
            </View>
            {user ? (
              <SecondaryButton
                label="退出登录"
                icon="log-out"
                onPress={() => void logout()}
                style={styles.loginButton}
              />
            ) : (
              <PrimaryButton
                label={authStatus === 'loading' ? '正在恢复账号…' : '邮箱登录'}
                icon="mail"
                disabled={authStatus === 'loading'}
                onPress={() => router.push('/login')}
                style={styles.loginButton}
              />
            )}
          </Panel>

          <Panel style={styles.quotaCard}>
            <View style={styles.quotaHead}>
              <View>
                <Kicker>当前创作额度</Kicker>
                <View style={styles.quotaValueRow}>
                  <Text style={styles.quotaValue}>{quota.remaining}</Text>
                  <Text style={styles.quotaTotal}> / {quota.limit} 单位</Text>
                </View>
              </View>
              <StatusBadge tone="info">{quotaProjectLabel(quota)}</StatusBadge>
            </View>
            <ProgressTrack value={progress} />
            <View style={styles.quotaFacts}>
              <View>
                <Text style={styles.factLabel}>当前项目</Text>
                <MonoText>{quota.episodeCount > 0 ? `${quota.episodeCount} 集` : '待同步'}</MonoText>
              </View>
              <View>
                <Text style={styles.factLabel}>本期已用</Text>
                <MonoText>{quota.used} 单位</MonoText>
              </View>
              <View>
                <Text style={styles.factLabel}>剩余额度</Text>
                <MonoText>{quota.remaining} 单位</MonoText>
              </View>
            </View>
            <View style={styles.quotaPresetHead}>
              <View>
                <Kicker>集数预设</Kicker>
                <Text style={styles.quotaCost}>{quotaCostLabel(quota)}</Text>
              </View>
              <Text numberOfLines={1} style={styles.pricingVersion}>
                {quotaPriceVersionLabel(quota)}
              </Text>
            </View>
            {quotaPresets.length > 0 ? (
              <View style={styles.quotaPresets}>
                {quotaPresets.map((preset) => {
                  const selected = preset.episodeCount === quota.episodeCount;
                  return (
                    <View
                      key={preset.episodeCount}
                      style={[styles.quotaPreset, selected && styles.quotaPresetSelected]}
                    >
                      <Text style={[styles.presetEpisodes, selected && styles.presetSelectedText]}>
                        {preset.episodeCount} 集
                      </Text>
                      <Text style={[styles.presetCost, selected && styles.presetSelectedText]}>
                        {preset.cost}
                      </Text>
                      <Text style={styles.presetProjects}>{preset.projects}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </Panel>

          <View style={styles.sectionHead}>
            <Kicker>偏好与安全</Kicker>
            <Text style={styles.sectionTitle}>设置</Text>
          </View>

          <Panel style={styles.settingsList}>
            {settings.map((item, index) => (
              <View key={item.key}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}，${item.value}`}
                  onPress={'onPress' in item ? item.onPress : undefined}
                  style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
                >
                  <View style={styles.settingIcon}>
                    <Feather name={item.icon} size={17} color={colors.textSecondary} />
                  </View>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>{item.label}</Text>
                    <Text style={styles.settingValue}>{item.value}</Text>
                  </View>
                  {item.key === 'analytics' ? (
                    <Switch
                      accessibilityLabel="匿名体验分析"
                      value={analyticsOn}
                      onValueChange={(next) => {
                        setAnalyticsOn(next);
                        void setAnalyticsEnabled(next);
                      }}
                      trackColor={{ false: colors.lineStrong, true: colors.info }}
                      thumbColor={colors.surface}
                    />
                  ) : (
                    <Feather name="chevron-right" size={17} color={colors.textMuted} />
                  )}
                </Pressable>
                {index < settings.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Panel>

          <View style={styles.legalRow}>
            <Pressable onPress={() => router.push('/legal')}><Text style={styles.legalText}>用户协议</Text></Pressable>
            <Pressable onPress={() => router.push('/legal')}><Text style={styles.legalText}>隐私政策</Text></Pressable>
            <Pressable onPress={() => router.push('/account/data')}>
              <Text style={styles.legalText}>删除账号</Text>
            </Pressable>
          </View>

          <Text style={styles.version}>
            成剧 VeyaFrame · Native Preview {Constants.expoConfig?.version ?? 'dev'}
          </Text>
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
    gap: spacing.md,
  },
  accountCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  avatar: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  accountCopy: {
    gap: 4,
  },
  accountTitle: {
    color: colors.text,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  loginButton: {
    marginTop: spacing.xs,
  },
  quotaCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  quotaHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  quotaValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  quotaValue: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 29,
    fontWeight: '600',
  },
  quotaTotal: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.label,
  },
  quotaFacts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  quotaPresetHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  quotaCost: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: type.micro,
  },
  pricingVersion: {
    maxWidth: '52%',
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.micro,
    textAlign: 'right',
  },
  quotaPresets: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  quotaPreset: {
    minWidth: 0,
    flex: 1,
    gap: 3,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  quotaPresetSelected: {
    borderColor: colors.lineStrong,
    backgroundColor: colors.elevated,
  },
  presetEpisodes: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: type.caption,
    fontWeight: '600',
  },
  presetCost: {
    color: colors.textSecondary,
    fontSize: type.micro,
    lineHeight: 15,
  },
  presetProjects: {
    color: colors.textMuted,
    fontSize: type.micro,
    lineHeight: 15,
  },
  presetSelectedText: {
    color: colors.text,
  },
  factLabel: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  sectionHead: {
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  settingsList: {
    overflow: 'hidden',
  },
  settingRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  settingIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.elevated,
  },
  settingCopy: {
    flex: 1,
    minWidth: 0,
  },
  settingLabel: {
    color: colors.text,
    fontSize: type.label,
    fontWeight: '500',
  },
  settingValue: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: type.micro,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  legalText: {
    color: colors.textMuted,
    fontSize: type.caption,
  },
  version: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.micro,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

