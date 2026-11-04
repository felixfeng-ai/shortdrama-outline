import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing, type } from '@/constants/tokens';
import type { AgentMode, AgentPhase } from '@/lib/agent-session';

export function AgentComposer({
  mode,
  phase,
  value,
  onChangeText,
  onSend,
  onStop,
  onToggleMode,
  disabled = false,
}: {
  mode: AgentMode;
  phase: AgentPhase;
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onToggleMode: () => void;
  disabled?: boolean;
}) {
  const busy = phase === 'working';
  const locked =
    disabled ||
    busy ||
    ['proposed', 'applying', 'apply-error'].includes(phase);
  const canSend = !locked && value.trim().length > 0;

  function pressHaptic() {
    void Haptics.selectionAsync().catch(() => {});
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="给 AI 场记的指令"
          editable={!locked}
          multiline
          onChangeText={onChangeText}
          placeholder={
            busy
              ? 'AI 场记正在检查当前场次…'
              : disabled
                ? '先选择一个项目'
              : phase === 'proposed'
                ? '本轮已返回，先选择上方动作'
                : '问进度、改一镜，或让它检查本集钩子…'
          }
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={value}
        />
        <View style={styles.bottomRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="添加附件"
            onPress={pressHaptic}
            style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
          >
            <Feather name="plus" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`当前为${mode === 'chat' ? '对话' : '创作'}模式，点击切换`}
            disabled={disabled || busy}
            onPress={() => {
              pressHaptic();
              onToggleMode();
            }}
            style={({ pressed }) => [styles.modeButton, pressed && styles.pressed]}
          >
            <Feather
              name={mode === 'chat' ? 'message-square' : 'pen-tool'}
              size={17}
              color={colors.textSecondary}
            />
            <Text style={styles.modeButtonText}>{mode === 'chat' ? '对话' : '创作'}</Text>
            <Feather name="chevron-down" size={13} color={colors.textMuted} />
          </Pressable>
          <View style={styles.spacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="语音输入"
            onPress={pressHaptic}
            style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
          >
            <Feather name="mic" size={19} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? '停止 AI 场记' : '发送给 AI 场记'}
            accessibilityState={{ disabled: disabled || (!busy && !canSend) }}
            disabled={disabled || (!busy && !canSend)}
            onPress={() => {
              pressHaptic();
              if (busy) {
                onStop();
              } else {
                onSend();
              }
            }}
            style={({ pressed }) => [
              styles.sendButton,
              !busy && !canSend && styles.sendButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Feather name={busy ? 'square' : 'arrow-up'} size={busy ? 15 : 19} color={colors.actionInk} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  composer: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    shadowColor: colors.text,
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  input: {
    minHeight: 40,
    maxHeight: 88,
    color: colors.text,
    fontSize: type.bodyLarge,
    lineHeight: 23,
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  bottomRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spacer: {
    flex: 1,
  },
  toolButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  modeButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 10,
  },
  modeButtonText: {
    color: colors.textSecondary,
    fontSize: type.caption,
    fontWeight: '500',
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.action,
  },
  sendButtonDisabled: {
    opacity: 0.32,
  },
  pressed: {
    opacity: 0.7,
  },
});

