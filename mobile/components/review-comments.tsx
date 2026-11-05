import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing, type } from '@/constants/tokens';
import {
  createReviewComment,
  fetchReviewComments,
  resolveReviewComment,
  type ReviewComment,
} from '@/lib/review-comments-api';

export function ReviewComments({
  projectId,
  apiBaseUrl,
  targetId,
  fetchImpl,
}: {
  projectId: string;
  apiBaseUrl: string;
  targetId: string;
  fetchImpl: typeof fetch;
}) {
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'comment' | 'reject' | 'resolve' | ''>('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!projectId || !targetId) return;
    void fetchReviewComments(apiBaseUrl, projectId, targetId, fetchImpl)
      .catch(() => [])
      .then(setComments);
  }, [apiBaseUrl, fetchImpl, projectId, targetId]);

  useEffect(load, [load]);

  async function submit(kind: 'comment' | 'reject') {
    if (!body.trim() || busy) return;
    setBusy(kind);
    setError('');
    try {
      const comment = await createReviewComment(
        apiBaseUrl,
        projectId,
        { targetType: 'shot', targetId, body, kind },
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
        <View>
          <Text style={styles.title}>镜头批注</Text>
          <Text style={styles.hint}>退回只记录原因，不改变当前采用版本。</Text>
        </View>
        <Text style={styles.count}>{comments.filter((item) => item.status === 'open').length} 待处理</Text>
      </View>
      <TextInput
        accessibilityLabel="镜头批注或退回原因"
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
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {comments.length > 0 ? (
        <View style={styles.list}>
          {comments.slice(0, 8).map((comment) => (
            <View key={comment.id} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.time}>
                  {new Date(comment.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </Text>
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
  title: { color: colors.textSecondary, fontSize: type.label, fontWeight: '600' },
  hint: { marginTop: 2, color: colors.textMuted, fontSize: type.micro, lineHeight: 16 },
  count: { color: colors.textMuted, fontSize: type.micro },
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
  actions: { flexDirection: 'row', gap: spacing.xs },
  rejectButton: {
    minHeight: 42,
    flex: 1,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    backgroundColor: colors.action,
  },
  commentText: { color: colors.actionInk, fontSize: type.caption, fontWeight: '600' },
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
  time: { color: colors.textMuted, fontSize: 9 },
  body: { color: colors.textSecondary, fontSize: type.micro, lineHeight: 17 },
  resolved: { color: colors.textMuted, textDecorationLine: 'line-through' },
  resolve: { color: colors.info, fontSize: type.micro, fontWeight: '600' },
  pressed: { opacity: 0.68 },
});
