import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  Divider,
  IconButton,
  Kicker,
  Panel,
  PrimaryButton,
  ScreenFade,
  ScreenHeader,
  StatusBadge,
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import { useAuth } from '@/lib/auth-store';
import {
  FEEDBACK_CATEGORIES,
  fetchMobileFeedback,
  submitMobileFeedback,
  type FeedbackCategory,
  type MobileFeedback,
} from '@/lib/feedback-api';
import { currentFeedbackContext } from '@/lib/feedback-context';
import { workspaceApiBaseUrl } from '@/lib/workspace-api';

const dateLabel = (value: number) =>
  new Date(value).toLocaleString('zh-CN', { hour12: false });

export default function FeedbackScreen() {
  const pathname = usePathname();
  const { authorizedFetch } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('agent');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<MobileFeedback[]>([]);
  const [submitted, setSubmitted] = useState<MobileFeedback | null>(null);
  const context = currentFeedbackContext(pathname ?? '');

  useEffect(() => {
    let active = true;
    void fetchMobileFeedback(workspaceApiBaseUrl, authorizedFetch)
      .then((items) => {
        if (active) setHistory(items);
      })
      .catch(() => {
        // History is optional; submission remains available.
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [authorizedFetch]);

  async function submit() {
    const text = body.trim();
    if (busy || text.length < 5) return;
    setBusy(true);
    setMessage('');
    try {
      const feedback = await submitMobileFeedback(
        workspaceApiBaseUrl,
        {
          category,
          body: text,
          ...context,
        },
        authorizedFetch,
      );
      setSubmitted(feedback);
      setHistory((items) => [feedback, ...items.filter((item) => item.id !== feedback.id)]);
      setMessage('反馈已提交，测试负责人会按账号和设备信息排查。');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '反馈提交失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <ScreenHeader
          kicker="INTERNAL FEEDBACK"
          title="内测反馈"
          left={<IconButton icon="arrow-left" label="返回我的" onPress={() => router.back()} />}
          right={submitted ? <StatusBadge tone="success">已提交</StatusBadge> : undefined}
        />
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Text style={styles.title}>把出问题的步骤和结果说清楚</Text>
            <BodyText dim>
              自动附带 App 版本、系统、机型和当前页面，不上传项目正文、提示词或 Token。
            </BodyText>
          </View>

          <Panel style={styles.card}>
            <Kicker>问题类型</Kicker>
            <View style={styles.categories}>
              {FEEDBACK_CATEGORIES.map((item) => {
                const selected = category === item.value;
                return (
                  <Pressable
                    key={item.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    disabled={busy || Boolean(submitted)}
                    onPress={() => setCategory(item.value)}
                    style={({ pressed }) => [
                      styles.category,
                      selected && styles.categoryActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>
                      {item.label}
                    </Text>
                    {selected ? <Feather name="check" size={14} color={colors.action} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Panel>

          <Panel style={styles.card}>
            <View style={styles.cardHead}>
              <Kicker>问题描述</Kicker>
              <Text style={styles.counter}>{body.length} / 2000</Text>
            </View>
            <TextInput
              accessibilityLabel="内测反馈问题描述"
              editable={!busy && !submitted}
              maxLength={2000}
              multiline
              onChangeText={setBody}
              placeholder="例如：在 Redmi 上点麦克风后提示服务不可用；希望记录当时所在页面和按钮。"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              textAlignVertical="top"
              value={body}
            />
            <Text style={styles.hint}>至少 5 个字符。失败时正文会保留，可直接重试。</Text>
          </Panel>

          <Panel style={styles.context}>
            <View style={styles.contextHead}>
              <Kicker>自动附带的信息</Kicker>
              <Feather name="shield" size={15} color={colors.info} />
            </View>
            <Divider />
            <ContextRow label="版本" value={`${context.appVersion} (${context.buildVersion})`} />
            <ContextRow label="设备" value={`${context.deviceModel} · ${context.platform} ${context.osVersion}`} />
            <ContextRow label="当前页面" value={context.screen || '未知页面'} />
          </Panel>

          {message ? (
            <Text style={[styles.message, submitted && styles.success]}>{message}</Text>
          ) : null}
          {submitted ? (
            <Panel style={styles.receipt}>
              <Kicker>反馈编号</Kicker>
              <Text selectable style={styles.receiptId}>{submitted.id}</Text>
              <BodyText dim>提交时间：{dateLabel(submitted.createdAt)}</BodyText>
            </Panel>
          ) : null}

          <PrimaryButton
            label={busy ? '正在提交反馈…' : '提交内测反馈'}
            icon={busy ? 'loader' : 'send'}
            disabled={busy || Boolean(submitted) || body.trim().length < 5}
            onPress={() => void submit()}
          />

          <View style={styles.historyHead}>
            <Kicker>最近反馈</Kicker>
            {loadingHistory ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
          </View>
          {history.length === 0 && !loadingHistory ? (
            <Text style={styles.empty}>当前账号还没有提交过内测反馈。</Text>
          ) : (
            <Panel style={styles.historyList}>
              {history.slice(0, 5).map((item, index) => (
                <View key={item.id}>
                  <View style={styles.historyRow}>
                    <View style={styles.historyCopy}>
                      <Text style={styles.historyTitle}>{item.body}</Text>
                      <Text style={styles.historyMeta}>
                        {FEEDBACK_CATEGORIES.find((entry) => entry.value === item.category)?.label ?? item.category}
                        {' · '}{dateLabel(item.createdAt)}
                      </Text>
                    </View>
                    <StatusBadge tone="info">待处理</StatusBadge>
                  </View>
                  {index < Math.min(history.length, 5) - 1 ? <Divider /> : null}
                </View>
              ))}
            </Panel>
          )}
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.contextRow}>
      <Text style={styles.contextLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.contextValue}>{value}</Text>
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
  card: { padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  category: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  categoryActive: { borderColor: 'rgba(184,101,79,0.35)', backgroundColor: colors.accentSoft },
  categoryText: { color: colors.textSecondary, fontSize: type.caption },
  categoryTextActive: { color: colors.action, fontWeight: '600' },
  counter: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: type.micro },
  input: {
    minHeight: 150,
    color: colors.text,
    fontSize: type.body,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  hint: { color: colors.textMuted, fontSize: type.micro, lineHeight: 16 },
  context: { padding: spacing.md, gap: spacing.xs },
  contextHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contextRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  contextLabel: { color: colors.textMuted, fontSize: type.caption },
  contextValue: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: type.caption,
    textAlign: 'right',
  },
  message: { color: colors.warningInk, fontSize: type.caption, lineHeight: 19, textAlign: 'center' },
  success: { color: colors.successInk },
  receipt: { padding: spacing.md, gap: spacing.xs },
  receiptId: { color: colors.text, fontFamily: fonts.mono, fontSize: type.caption },
  historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { color: colors.textMuted, fontSize: type.caption },
  historyList: { overflow: 'hidden' },
  historyRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  historyCopy: { flex: 1, minWidth: 0, gap: 4 },
  historyTitle: { color: colors.text, fontSize: type.caption, lineHeight: 18 },
  historyMeta: { color: colors.textMuted, fontSize: type.micro },
  pressed: { opacity: 0.72 },
});
