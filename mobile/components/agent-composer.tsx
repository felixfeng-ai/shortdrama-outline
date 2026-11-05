import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing, type } from '@/constants/tokens';
import type { AgentMode, AgentPhase } from '@/lib/agent-session';
import {
  appendVoiceTranscript,
  readPickedImage,
} from '@/lib/media-input';
import { useMediaAttachments } from '@/lib/media-attachment-store';
import { voiceErrorMessage } from '@/lib/voice-errors';

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
  const { attachments, addAttachment, removeAttachment } = useMediaAttachments();
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const voiceBaseRef = useRef('');
  const onChangeTextRef = useRef(onChangeText);

  useEffect(() => {
    onChangeTextRef.current = onChangeText;
  }, [onChangeText]);

  useEffect(() => {
    const result = ExpoSpeechRecognitionModule.addListener('result', (event) => {
      const transcript = event.results[0]?.transcript ?? '';
      onChangeTextRef.current(appendVoiceTranscript(voiceBaseRef.current, transcript));
    });
    const start = ExpoSpeechRecognitionModule.addListener('start', () => {
      setVoicePreparing(false);
      setRecognizing(true);
      setMediaError('');
    });
    const end = ExpoSpeechRecognitionModule.addListener('end', () => {
      setVoicePreparing(false);
      setRecognizing(false);
    });
    const error = ExpoSpeechRecognitionModule.addListener('error', (event) => {
      setVoicePreparing(false);
      setRecognizing(false);
      const message = voiceErrorMessage(event.error, event.message);
      setMediaError(message ?? '');
    });
    return () => {
      result.remove();
      start.remove();
      end.remove();
      error.remove();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    };
  }, []);

  function pressHaptic() {
    void Haptics.selectionAsync().catch(() => {});
  }

  async function pickImage(source: 'camera' | 'library') {
    setMediaError('');
    setShowAttachmentMenu(false);
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error(source === 'camera' ? '相机权限未开启' : '相册权限未开启');
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            allowsMultipleSelection: false,
          });
      const attachment = readPickedImage(result);
      if (attachment) {
        addAttachment(attachment);
      }
    } catch (reason) {
      setMediaError(reason instanceof Error ? reason.message : '图片选择失败');
    }
  }

  async function toggleVoice() {
    setMediaError('');
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
      setRecognizing(false);
      return;
    }
    if (voicePreparing) return;
    setVoicePreparing(true);
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) throw new Error('麦克风或语音识别权限未开启');
      voiceBaseRef.current = value;
      setVoicePreparing(false);
      setRecognizing(true);
      ExpoSpeechRecognitionModule.start({
        lang: 'zh-CN',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    } catch (reason) {
      setVoicePreparing(false);
      setRecognizing(false);
      setMediaError(reason instanceof Error ? reason.message : '语音识别不可用');
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.composer}>
        {attachments.length > 0 ? (
          <View style={styles.attachments}>
            {attachments.map((attachment) => (
              <View key={attachment.id} style={styles.attachment}>
                <Image
                  accessible
                  accessibilityLabel={`本机参考图 ${attachment.name}`}
                  contentFit="cover"
                  source={{ uri: attachment.uri }}
                  style={styles.attachmentImage}
                />
                <View style={styles.attachmentCopy}>
                  <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                  <Text style={styles.attachmentMeta}>生成参考图 · 生成画面时使用</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`移除 ${attachment.name}`}
                  onPress={() => removeAttachment(attachment.id)}
                  style={({ pressed }) => [styles.removeAttachment, pressed && styles.pressed]}
                >
                  <Feather name="x" size={15} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <TextInput
          accessibilityLabel="给 Veya Agent 的指令"
          editable={!locked}
          multiline
          onChangeText={onChangeText}
          placeholder={
            busy
              ? 'Veya Agent 正在检查当前场次…'
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

        {showAttachmentMenu ? (
          <View style={styles.attachmentMenu}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="拍照"
              onPress={() => void pickImage('camera')}
              style={({ pressed }) => [styles.attachmentAction, pressed && styles.pressed]}
            >
              <Feather name="camera" size={18} color={colors.textSecondary} />
              <Text style={styles.attachmentActionText}>拍照</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="从相册选择"
              onPress={() => void pickImage('library')}
              style={({ pressed }) => [styles.attachmentAction, pressed && styles.pressed]}
            >
              <Feather name="image" size={18} color={colors.textSecondary} />
              <Text style={styles.attachmentActionText}>相册</Text>
            </Pressable>
          </View>
        ) : null}

        {mediaError ? <Text style={styles.mediaError}>{mediaError}</Text> : null}
        {voicePreparing ? (
          <Text style={styles.voiceState}>正在准备麦克风…</Text>
        ) : recognizing ? (
          <Text style={styles.voiceState}>正在听写 · 再次点麦克风停止</Text>
        ) : null}

        <View style={styles.bottomRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="添加附件"
            disabled={locked}
            onPress={() => {
              pressHaptic();
              setShowAttachmentMenu((open) => !open);
            }}
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
            accessibilityLabel={
              voicePreparing ? '正在准备语音输入' : recognizing ? '停止语音输入' : '语音输入'
            }
            disabled={locked || voicePreparing}
            onPress={() => {
              pressHaptic();
              void toggleVoice();
            }}
            style={({ pressed }) => [
              styles.toolButton,
              recognizing && styles.toolButtonActive,
              pressed && styles.pressed,
            ]}
          >
            {voicePreparing ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Feather
                name={recognizing ? 'square' : 'mic'}
                size={recognizing ? 15 : 19}
                color={recognizing ? colors.accent : colors.textSecondary}
              />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? '停止 Veya Agent' : '发送给 Veya Agent'}
            accessibilityState={{ disabled: disabled || (!busy && !canSend) }}
            disabled={disabled || (!busy && !canSend)}
            onPress={() => {
              pressHaptic();
              if (busy) onStop();
              else onSend();
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
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
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
  attachments: {
    gap: 6,
    paddingVertical: 4,
  },
  attachment: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
    padding: 5,
  },
  attachmentImage: {
    width: 36,
    height: 36,
    borderRadius: 5,
  },
  attachmentCopy: {
    flex: 1,
    minWidth: 0,
  },
  attachmentName: {
    color: colors.text,
    fontSize: type.caption,
    fontWeight: '500',
  },
  attachmentMeta: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: type.micro,
  },
  removeAttachment: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  attachmentMenu: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  attachmentAction: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  attachmentActionText: {
    color: colors.textSecondary,
    fontSize: type.caption,
    fontWeight: '500',
  },
  mediaError: {
    color: colors.warningInk,
    fontSize: type.caption,
    lineHeight: 18,
    paddingVertical: 3,
  },
  voiceState: {
    color: colors.info,
    fontSize: type.micro,
    paddingVertical: 3,
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
  toolButtonActive: {
    borderColor: 'rgba(184,101,79,0.36)',
    backgroundColor: colors.accentSoft,
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
