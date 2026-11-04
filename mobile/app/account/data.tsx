import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  IconButton,
  Kicker,
  Panel,
  PrimaryButton,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
} from '@/components/ui';
import { colors, radii, spacing, type } from '@/constants/tokens';
import { deleteAccount, exportAccount } from '@/lib/account-api';
import { downloadAuthenticatedFile } from '@/lib/asset-download';
import { useAuth } from '@/lib/auth-store';
import { workspaceApiBaseUrl } from '@/lib/workspace-api';

export default function AccountDataScreen() {
  const { status, authorizedFetch, getAccessHeaders, logout } = useAuth();
  const [busy, setBusy] = useState<'export' | 'delete' | ''>('');
  const [message, setMessage] = useState('');

  async function exportData() {
    if (status !== 'authenticated' || busy) return;
    setBusy('export');
    setMessage('');
    try {
      const data = await exportAccount(workspaceApiBaseUrl, authorizedFetch);
      const body = JSON.stringify(data, null, 2);
      if (typeof document !== 'undefined') {
        const blob = new Blob([body], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = `chengju-account-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(href);
        setMessage('账号数据已导出。');
      } else {
        const headers = await getAccessHeaders();
        await downloadAuthenticatedFile({
          url: `${workspaceApiBaseUrl}/api/account/export`,
          fileName: `chengju-account-${new Date().toISOString().slice(0, 10)}.json`,
          mime: 'application/json',
          fetchImpl: authorizedFetch,
          headers,
        });
        setMessage('账号数据已交由系统保存或分享。');
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '账号数据导出失败');
    } finally {
      setBusy('');
    }
  }

  function confirmDelete() {
    if (status !== 'authenticated' || busy) return;
    Alert.alert(
      '注销账号',
      '项目、生成图片、设备会话和账号数据都会被删除，且无法恢复。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认注销',
          style: 'destructive',
          onPress: () => void performDelete(),
        },
      ],
    );
  }

  async function performDelete() {
    setBusy('delete');
    setMessage('');
    try {
      await deleteAccount(workspaceApiBaseUrl, authorizedFetch);
      await logout().catch(() => {});
      router.replace('/me');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '账号注销失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="PRIVACY"
          title="数据与账号"
          left={<IconButton icon="arrow-left" label="返回账户" onPress={() => router.back()} />}
        />
        <ScrollView contentContainerStyle={styles.content}>
          <Panel style={styles.card}>
            <View style={styles.icon}><Feather name="download" size={19} color={colors.info} /></View>
            <Text style={styles.title}>导出我的数据</Text>
            <BodyText dim style={styles.body}>
              导出账号、项目、快照、生成任务和资产元数据。原始图片请在审片页单独下载。
            </BodyText>
            <PrimaryButton
              label={busy === 'export' ? '正在导出…' : '导出 JSON'}
              icon="download"
              disabled={status !== 'authenticated' || Boolean(busy)}
              onPress={() => void exportData()}
            />
          </Panel>

          <Panel style={styles.dangerCard}>
            <View style={[styles.icon, styles.dangerIcon]}>
              <Feather name="trash-2" size={19} color={colors.danger} />
            </View>
            <Text style={styles.title}>注销账号</Text>
            <BodyText dim style={styles.body}>
              删除账号项目和生成资产，终止全部设备会话。此操作不可恢复。
            </BodyText>
            <SecondaryButton
              label={busy === 'delete' ? '正在注销…' : '注销账号'}
              icon="trash-2"
              disabled={status !== 'authenticated' || Boolean(busy)}
              onPress={confirmDelete}
            />
          </Panel>

          {message ? <Text style={styles.message}>{message}</Text> : null}
          {status !== 'authenticated' ? (
            <BodyText dim style={styles.anonymous}>登录后才能导出或注销账号。</BodyText>
          ) : null}
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
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
  card: { padding: spacing.md, gap: spacing.sm },
  dangerCard: { padding: spacing.md, gap: spacing.sm, borderColor: 'rgba(184,78,68,0.22)' },
  icon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: 'rgba(92,117,111,0.09)',
  },
  dangerIcon: { backgroundColor: 'rgba(184,78,68,0.08)' },
  title: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  body: { fontSize: type.caption, lineHeight: 20 },
  message: { color: colors.textSecondary, fontSize: type.caption, lineHeight: 19, textAlign: 'center' },
  anonymous: { textAlign: 'center', fontSize: type.caption },
});
