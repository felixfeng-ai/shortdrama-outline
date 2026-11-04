import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
  IconButton,
  Kicker,
  Panel,
  PrimaryButton,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, spacing, type } from '@/constants/tokens';
import { normalizeEmail } from '@/lib/auth-api';
import { useAuth } from '@/lib/auth-store';

type Step = 'email' | 'code';

export default function LoginScreen() {
  const { requestCode, verifyCode } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    if (busy) return;
    try {
      const normalized = normalizeEmail(email);
      setBusy(true);
      setError('');
      const result = await requestCode(normalized);
      setEmail(normalized);
      setStep('code');
      setCooldown(result.cooldownSeconds);
      setDevCode(result.devCode ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '验证码发送失败');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (busy || code.trim().length !== 6) {
      setError('请输入 6 位验证码');
      return;
    }
    try {
      setBusy(true);
      setError('');
      await verifyCode(email, code.trim());
      router.replace('/me');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败，请检查验证码');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <ScreenHeader
          kicker="ACCOUNT / EMAIL"
          title={step === 'email' ? '邮箱登录' : '输入验证码'}
          left={<IconButton icon="arrow-left" label="返回" onPress={() => router.back()} />}
          right={<StatusBadge tone="info">与 Web 同账号</StatusBadge>}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.body}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.story}>
              <Text style={styles.storyTitle}>
                {step === 'email' ? '先保存这部戏，再继续写。' : `验证码已发送至 ${email}`}
              </Text>
              <BodyText>
                {step === 'email'
                  ? '用邮箱验证码登录。登录后会迁移当前匿名会话里的项目，并与 Web 使用同一个账号。'
                  : '验证码 5 分钟内有效。App 登录后保存 30 天刷新会话，Access Token 每 15 分钟自动更新。'}
              </BodyText>
            </View>

            <View style={styles.stepRail} accessibilityElementsHidden>
              <Text style={[styles.stepLabel, step === 'email' && styles.stepActive]}>01 邮箱</Text>
              <View style={styles.stepLine} />
              <Text style={[styles.stepLabel, step === 'code' && styles.stepActive]}>
                02 验证码
              </Text>
            </View>

            <Panel style={styles.formCard}>
              {step === 'email' ? (
                <>
                  <Text style={styles.label}>邮箱地址</Text>
                  <TextInput
                    accessibilityLabel="邮箱地址"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="name@example.com"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    value={email}
                  />
                  <PrimaryButton
                    label={busy ? '正在发送…' : '获取验证码'}
                    icon="mail"
                    disabled={busy || !email.trim()}
                    onPress={sendCode}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>6 位验证码</Text>
                  <TextInput
                    accessibilityLabel="邮箱验证码"
                    autoComplete="one-time-code"
                    keyboardType="number-pad"
                    maxLength={6}
                    onChangeText={setCode}
                    placeholder="000000"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, styles.codeInput]}
                    value={code}
                  />
                  {devCode ? (
                    <Text style={styles.devCode}>本地开发验证码：{devCode}</Text>
                  ) : null}
                  <PrimaryButton
                    label={busy ? '正在登录…' : '登录并同步项目'}
                    icon="log-in"
                    disabled={busy || code.trim().length !== 6}
                    onPress={submitCode}
                  />
                  <View style={styles.secondaryRow}>
                    <SecondaryButton
                      label={cooldown > 0 ? `${cooldown}s 后重发` : '重新发送'}
                      icon="refresh-cw"
                      disabled={busy || cooldown > 0}
                      onPress={sendCode}
                      style={styles.flexButton}
                    />
                    <SecondaryButton
                      label="换邮箱"
                      icon="edit-3"
                      disabled={busy}
                      onPress={() => {
                        setStep('email');
                        setCode('');
                        setDevCode('');
                        setError('');
                      }}
                      style={styles.flexButton}
                    />
                  </View>
                </>
              )}

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </Panel>

            <Pressable
              accessibilityRole="link"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.guestAction, pressed && styles.pressed]}
            >
              <Text style={styles.guestText}>暂不登录，继续使用匿名工作区</Text>
            </Pressable>

            <Text style={styles.note}>
              邮箱只用于发送登录验证码。登录后 Web 与 App 使用同一个项目和额度。
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenFade>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  story: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  storyTitle: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '600',
    lineHeight: 35,
  },
  stepRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepLabel: {
    color: colors.textMuted,
    fontSize: type.caption,
    fontWeight: '500',
  },
  stepActive: {
    color: colors.text,
    fontWeight: '600',
  },
  stepLine: {
    width: 28,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineStrong,
  },
  formCard: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  label: {
    color: colors.textSecondary,
    fontSize: type.caption,
    fontWeight: '500',
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 8,
    backgroundColor: colors.canvas,
    color: colors.text,
    fontSize: type.bodyLarge,
    paddingHorizontal: spacing.sm,
  },
  codeInput: {
    fontFamily: 'SpaceMono',
    fontSize: 22,
    letterSpacing: 7,
  },
  devCode: {
    color: colors.info,
    fontSize: type.caption,
  },
  error: {
    color: colors.warningInk,
    fontSize: type.caption,
    lineHeight: 19,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  flexButton: {
    flex: 1,
  },
  guestAction: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestText: {
    color: colors.textSecondary,
    fontSize: type.caption,
    textDecorationLine: 'underline',
  },
  note: {
    color: colors.textMuted,
    fontSize: type.caption,
    lineHeight: 19,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
