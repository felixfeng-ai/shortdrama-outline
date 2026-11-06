import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import {
  createReviewComment,
  fetchReviewComments,
  resolveReviewComment,
  timecodeLabel,
  type ReviewComment,
  type ReviewCommentKind,
} from '@/lib/review-comments-api';

export function ReviewComments({
  projectId,
  apiBaseUrl,
  targetId,
  fetchImpl,
  timecodeMs = null,
  screenshot = null,
  capturing = false,
  onCapture,
  onSeek,
  onCommentsChange,
}: {
  projectId: string;
  apiBaseUrl: string;
  targetId: string;
  fetchImpl: typeof fetch;
  timecodeMs?: number | null;
  screenshot?: ComponentProps<typeof Image>['source'] | null;
  capturing?: boolean;
  onCapture?: () => void;
  onSeek?: (timecodeMs: number) => void;
  onCommentsChange?: (comments: ReviewComment[]) => void;
}) {
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'comment' | 'reject' | 'final' | 'resolve' | ''>('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!projectId || !targetId) return;
    void fetchReviewComments(apiBaseUrl, projectId, targetId, fetchImpl)
      .catch(() => [])
      .then(setComments);
  }, [apiBaseUrl, fetchImpl, projectId, targetId]);

  useEffect(load, [load]);

  useEffect(() => {
    onCommentsChange?.(comments);
  }, [comments, onCommentsChange]);

  async function submit(kind: Extract<ReviewCommentKind, 'comment' | 'reject'>) {
    if (!body.trim() || busy) return;
    setBusy(kind);
    setError('');
    try {
      const comment = await createReviewComment(
        apiBaseUrl,
        projectId,
        {
          targetType: 'shot',
          targetId,
          body,
          kind,
          timecodeMs,
          frameMarked: Boolean(screenshot) && timecodeMs !== null,
        },
        fetchImpl,
      );
      setComments((current) => [comment, ...current]);
      setBody('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批注保存失败');
    } finally {
      setBusy('');
    }
  }

  async function markFinal() {
    if (busy) return;
    setBusy('final');
    setError('');
    try {
      const comment = await createReviewComment(
        apiBaseUrl,
        projectId,
        {
          targetType: 'shot',
          targetId,
          body: body.trim() || '镜头确认通过，可以进入定稿。',
          kind: 'final',
          timecodeMs,
          frameMarked: Boolean(screenshot) && timecodeMs !== null,
        },
        fetchImpl,
      );
      setComments((current) => [comment, ...current]);
      setBody('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '定稿标记失败');
    } finally {
      setBusy('');
    }
  }

  async function resolve(comment: ReviewComment) {
    if (busy) return;
    setBusy('resolve');
    setError('');
    try {
      const updated = await resolveReviewComment(apiBaseUrl, projectId, comment.id, fetchImpl);
      setComments((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批注状态更新失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={styles.title}>时间码批注</Text>
          <Text style={styles.hint}>
            退回只记录原因；定稿会进入返修队列的“待定稿”。当前画面：
            {timecodeLabel(timecodeMs)}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.count}>
          {comments.filter((item) => item.status === 'open').length} 待处理
        </Text>
      </View>
      {onCapture || screenshot ? (
        <View style={styles.captureRow}>
          {screenshot ? (
            <Image
              accessible
              accessibilityLabel={`截取画面 ${timecodeLabel(timecodeMs)}`}
              contentFit="cover"
              source={screenshot}
              style={styles.screenshot}
            />
          ) : (
            <View style={styles.screenshotEmpty}>
              <Feather name="image" size={16} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.captureCopy}>
            <Text style={styles.captureTitle}>
              {screenshot ? `已截取 ${timecodeLabel(timecodeMs)} 画面` : '把问题钉在当前画面'}
            </Text>
            <Text style={styles.captureHint}>
              {screenshot
                ? '截图仅随本次批注预览，时间码会同步到项目记录。'
                : '先截取当前帧，再写具体修改意见。'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="截取当前帧"
            disabled={capturing}
            onPress={onCapture}
            style={({ pressed }) => [styles.captureButton, pressed && styles.pressed]}
          >
            {capturing ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Feather name="camera" size={16} color={colors.textSecondary} />
            )}
            <Text style={styles.captureButtonText}>截取当前帧</Text>
          </Pressable>
        </View>
      ) : null}
      <TextInput
        accessibilityLabel="当前时间码的镜头批注或退回原因"
        multiline
        onChangeText={setBody}
        placeholder="写退回原因或这一镜的具体修改意见"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        value={body}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={!body.trim() || Boolean(busy)}
          onPress={() => void submit('reject')}
          style={({ pressed }) => [styles.rejectButton, pressed && styles.pressed]}
        >
          <Feather name="corner-up-left" size={14} color={colors.warningInk} />
          <Text style={styles.rejectText}>{busy === 'reject' ? '保存中…' : '退回并说明'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!body.trim() || Boolean(busy)}
          onPress={() => void submit('comment')}
          style={({ pressed }) => [styles.commentButton, pressed && styles.pressed]}
        >
          <Feather name="message-circle" size={14} color={colors.actionInk} />
          <Text style={styles.commentText}>{busy === 'comment' ? '保存中…' : '加入批注'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={Boolean(busy)}
          onPress={() => void markFinal()}
          style={({ pressed }) => [styles.finalButton, pressed && styles.pressed]}
        >
          <Feather name="check-square" size={14} color={colors.info} />
          <Text style={styles.finalText}>{busy === 'final' ? '保存中…' : '标记定稿'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {comments.length > 0 ? (
        <View style={styles.list}>
          {comments.slice(0, 8).map((comment) => (
            <View key={comment.id} style={styles.row}>
              <View style={styles.rowCopy}>
                <View style={styles.rowMeta}>
                  {comment.timecodeMs !== null ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`跳到 ${timecodeLabel(comment.timecodeMs)}`}
                      onPress={() => onSeek?.(comment.timecodeMs ?? 0)}
                    >
                      <Text style={styles.timecode}>{timecodeLabel(comment.timecodeMs)}</Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.kind}>
                    {comment.kind === 'reject'
                      ? '返修'
                      : comment.kind === 'final'
                        ? '定稿'
                        : comment.kind === 'timecode'
                          ? '画面批注'
                          : '批注'}
                  </Text>
                  {comment.frameMarked ? <Text style={styles.frameMarked}>截图标记</Text> : null}
                  <Text style={styles.time}>
                    {new Date(comment.createdAt).toLocaleString('zh-CN', { hour12: false })}
                  </Text>
                </View>
                <Text style={[styles.body, comment.status === 'resolved' && styles.resolved]}>
                  {comment.body}
                </Text>
              </View>
              {comment.status === 'open' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={Boolean(busy)}
                  onPress={() => void resolve(comment)}
                >
                  <Text style={styles.resolve}>已处理</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.textSecondary, fontSize: type.label, fontWeight: '600' },
  hint: { marginTop: 2, color: colors.textMuted, fontSize: type.micro, lineHeight: 16 },
  count: { flexShrink: 0, color: colors.textMuted, fontSize: type.micro },
  input: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: type.caption,
    lineHeight: 19,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  screenshot: {
    width: 76,
    height: 54,
    flexShrink: 0,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
  },
  screenshotEmpty: {
    width: 76,
    height: 54,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
  },
  captureCopy: { flex: 1, minWidth: 0, gap: 2 },
  captureTitle: { color: colors.text, fontSize: type.caption, fontWeight: '600', lineHeight: 18 },
  captureHint: { color: colors.textMuted, fontSize: type.micro, lineHeight: 14 },
  captureButton: {
    minWidth: 88,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  captureButtonText: { color: colors.textSecondary, fontSize: type.micro, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rejectButton: {
    minHeight: 42,
    flexGrow: 1,
    flexBasis: 116,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(184,101,79,0.3)',
    borderRadius: radii.md,
    backgroundColor: 'rgba(184,101,79,0.06)',
  },
  rejectText: { color: colors.warningInk, fontSize: type.caption, fontWeight: '600' },
  commentButton: {
    minHeight: 42,
    flexGrow: 1,
    flexBasis: 116,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    backgroundColor: colors.action,
  },
  commentText: { color: colors.actionInk, fontSize: type.caption, fontWeight: '600' },
  finalButton: {
    minHeight: 42,
    flexGrow: 1,
    flexBasis: 116,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(92,117,111,0.3)',
    borderRadius: radii.md,
    backgroundColor: 'rgba(92,117,111,0.06)',
  },
  finalText: { color: colors.info, fontSize: type.caption, fontWeight: '600' },
  error: { color: colors.warningInk, fontSize: type.micro, lineHeight: 17 },
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  timecode: {
    color: colors.info,
    fontFamily: fonts.mono,
    fontSize: type.micro,
    fontWeight: '600',
  },
  kind: { color: colors.textSecondary, fontSize: type.micro, fontWeight: '600' },
  frameMarked: { color: colors.warningInk, fontSize: type.micro, fontWeight: '600' },
  time: { color: colors.textMuted, fontSize: type.micro },
  body: { color: colors.textSecondary, fontSize: type.micro, lineHeight: 17 },
  resolved: { color: colors.textMuted, textDecorationLine: 'line-through' },
  resolve: { color: colors.info, fontSize: type.micro, fontWeight: '600' },
  pressed: { opacity: 0.68 },
});
