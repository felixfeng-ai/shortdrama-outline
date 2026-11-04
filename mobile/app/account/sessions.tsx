import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import {
  fetchAccountSessions,
  revokeAccountSession,
  type AccountSession,
} from '@/lib/account-api';
import { useAuth } from '@/lib/auth-store';
import { workspaceApiBaseUrl } from '@/lib/workspace-api';

function sessionTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export default function AccountSessionsScreen() {
  const { status, authorizedFetch, logout } = useAuth();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    void fetchAccountSessions(workspaceApiBaseUrl, authorizedFetch)
      .then(setSessions)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '设备列表读取失败');
      })
      .finally(() => setLoading(false));
  }, [authorizedFetch, status]);

  useEffect(load, [load]);

  async function revoke(session: AccountSession) {
    if (busyId) return;
    setBusyId(session.id);
    setError('');
    try {
      await revokeAccountSession(workspaceApiBaseUrl, session.id, authorizedFetch);
      if (session.current) {
        await logout().catch(() => {});
        router.replace('/me');
        return;
      }
      setSessions((items) => items.filter((item) => item.id !== session.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '设备下线失败');
    } finally {
      setBusyId('');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="ACCOUNT"
          title="登录设备"
          left={<IconButton icon="arrow-left" label="返回账户" onPress={() => router.back()} />}
          right={<IconButton icon="refresh-cw" label="刷新设备" onPress={load} />}
        />
        <ScrollView contentContainerStyle={styles.content}>
          {status !== 'authenticated' ? (
            <State title="当前是匿名会话" body="登录后可查看和管理所有设备。" />
          ) : loading ? (
            <State loading title="正在读取设备" body="同步当前账号的登录会话。" />
          ) : sessions.length === 0 ? (
            <State title="没有活跃设备" body="当前账号暂时没有可用会话。" />
          ) : (
            <Panel style={styles.list}>
              {sessions.map((session, index) => (
                <View key={session.id}>
                  <View style={styles.row}>
                    <View style={styles.icon}>
                      <Feather
                        name={session.client === 'app' ? 'smartphone' : 'monitor'}
                        size={18}
                        color={colors.textSecondary}
                      />
                    </View>
                    <View style={styles.copy}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name}>{session.deviceName}</Text>
                        {session.current ? <StatusBadge tone="success">当前设备</StatusBadge> : null}
                      </View>
                      <Text style={styles.meta}>最后活动 {sessionTime(session.lastSeenAt)}</Text>
                      <MonoText style={styles.expiry}>有效至 {sessionTime(session.expiresAt)}</MonoText>
                    </View>
                    <SecondaryButton
                      label={busyId === session.id ? '处理中' : session.current ? '退出' : '下线'}
                      icon="log-out"
                      disabled={Boolean(busyId)}
                      onPress={() => void revoke(session)}
                      style={styles.revoke}
                    />
                  </View>
                  {index < sessions.length - 1 ? <Divider /> : null}
                </View>
              ))}
            </Panel>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <BodyText dim style={styles.note}>
            下线后，该设备需要重新使用邮箱验证码登录。
          </BodyText>
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

function State({ title, body, loading = false }: { title: string; body: string; loading?: boolean }) {
  return (
    <Panel style={styles.state}>
      {loading ? <ActivityIndicator color={colors.textSecondary} /> : (
        <View style={styles.icon}><Feather name="shield" size={18} color={colors.textSecondary} /></View>
      )}
      <Text style={styles.stateTitle}>{title}</Text>
      <BodyText dim style={styles.stateBody}>{body}</BodyText>
    </Panel>
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
  list: { overflow: 'hidden' },
  row: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  icon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { flexShrink: 1, color: colors.text, fontSize: type.label, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: type.micro },
  expiry: { color: colors.textMuted, fontSize: 9 },
  revoke: { minWidth: 72, paddingHorizontal: spacing.xs },
  error: { color: colors.warningInk, fontSize: type.caption, lineHeight: 19 },
  note: { textAlign: 'center', fontSize: type.micro },
  state: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.xl },
  stateTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  stateBody: { textAlign: 'center', fontSize: type.caption },
});
