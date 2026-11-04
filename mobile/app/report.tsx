import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BodyText, IconButton, Kicker, Panel, PrimaryButton, ScreenFade, ScreenHeader, StatusBadge } from '@/components/ui';
import { colors, radii, spacing, type } from '@/constants/tokens';
import { submitContentReport, type ContentReportReason } from '@/lib/trust-api';
import { workspaceApiBaseUrl } from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';

const REASONS: Array<{ value: ContentReportReason; label: string }> = [
  { value: 'copyright', label: '侵权或盗用' },
  { value: 'illegal', label: '违法内容' },
  { value: 'hate', label: '仇恨内容' },
  { value: 'harassment', label: '骚扰或威胁' },
  { value: 'privacy', label: '隐私与肖像' },
  { value: 'sexual', label: '不当性内容' },
  { value: 'other', label: '其他问题' },
];

function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default function ReportScreen() {
  const params = useLocalSearchParams<{
    projectId?: string | string[];
    targetType?: string | string[];
    targetId?: string | string[];
  }>();
  const { data } = useWorkspace();
  const [reason, setReason] = useState<ContentReportReason>('copyright');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const projectId = param(params.projectId) || data.activeProject?.id || '';
  const targetId = param(params.targetId);
  const rawType = param(params.targetType);
  const targetType = ['project', 'asset', 'comment', 'share'].includes(rawType)
    ? rawType as 'project' | 'asset' | 'comment' | 'share'
    : 'project';

  async function submit() {
    if (busy || submitted) return;
    setBusy(true);
    setMessage('');
    try {
      await submitContentReport(workspaceApiBaseUrl, {
        projectId,
        targetType,
        targetId: targetId || projectId,
        reason,
        detail,
      });
      setSubmitted(true);
      setMessage('举报已提交，等待人工核查。');
    } catch (reasonValue) {
      setMessage(reasonValue instanceof Error ? reasonValue.message : '举报提交失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="TRUST / REPORT"
          title="内容举报"
          left={<IconButton icon="arrow-left" label="返回" onPress={() => router.back()} />}
          right={submitted ? <StatusBadge tone="success">已提交</StatusBadge> : undefined}
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Panel style={styles.card}>
            <Kicker>举报原因</Kicker>
            <View style={styles.reasons}>
              {REASONS.map((item) => (
                <Pressable
                  key={item.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reason === item.value }}
                  disabled={submitted}
                  onPress={() => setReason(item.value)}
                  style={({ pressed }) => [
                    styles.reason,
                    reason === item.value && styles.reasonActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.reasonText, reason === item.value && styles.reasonTextActive]}>
                    {item.label}
                  </Text>
                  {reason === item.value ? <Feather name="check" size={14} color={colors.action} /> : null}
                </Pressable>
              ))}
            </View>
          </Panel>

          <Panel style={styles.card}>
            <Kicker>补充说明</Kicker>
            <TextInput
              accessibilityLabel="举报补充说明"
              editable={!submitted}
              maxLength={1000}
              multiline
              onChangeText={setDetail}
              placeholder="说明涉及的内容、权利来源或具体问题"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              textAlignVertical="top"
              value={detail}
            />
            <Text style={styles.counter}>{detail.length} / 1000</Text>
          </Panel>

          {message ? (
            <Text style={[styles.message, submitted && styles.success]}>{message}</Text>
          ) : null}
          <PrimaryButton
            label={busy ? '正在提交…' : submitted ? '已提交' : '提交举报'}
            icon={submitted ? 'check' : 'flag'}
            disabled={busy || submitted || !projectId}
            onPress={() => void submit()}
          />
          <BodyText dim style={styles.note}>
            举报不会立即删除内容。涉及紧急人身安全或违法风险时，请同时联系当地主管部门。
          </BodyText>
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { padding: spacing.md, gap: spacing.sm },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reason: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  reasonActive: { borderColor: 'rgba(184,101,79,0.35)', backgroundColor: colors.accentSoft },
  reasonText: { color: colors.textSecondary, fontSize: type.caption },
  reasonTextActive: { color: colors.action, fontWeight: '600' },
  input: {
    minHeight: 130,
    color: colors.text,
    fontSize: type.body,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  counter: { color: colors.textMuted, fontSize: type.micro, textAlign: 'right' },
  message: { color: colors.warningInk, fontSize: type.caption, lineHeight: 19, textAlign: 'center' },
  success: { color: colors.successInk },
  note: { textAlign: 'center', fontSize: type.micro },
  pressed: { opacity: 0.72 },
});
