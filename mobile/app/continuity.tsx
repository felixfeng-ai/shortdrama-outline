import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  StatusBadge,
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import { useAuth } from '@/lib/auth-store';
import {
  checkSceneContinuity,
  type ContinuityIssue,
  type ContinuityReport,
} from '@/lib/continuity-api';
import {
  appendVoiceTranscript,
  readPickedImage,
  type LocalImageAttachment,
} from '@/lib/media-input';
import { attachmentToGenerationReference } from '@/lib/media-encoding';
import {
  createReviewComment,
  fetchReviewComments,
  markBestReviewComment,
  type ReviewComment,
} from '@/lib/review-comments-api';
import {
  voiceAvailabilityMessage,
  voiceErrorMessage,
} from '@/lib/voice-errors';
import { workspaceApiBaseUrl } from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';

const AREA_LABELS: Record<ContinuityIssue['area'], string> = {
  character: '人物造型',
  place: '地点结构',
  prop: '道具',
  lighting: '光线',
  composition: '构图',
};

function severityTone(value: ContinuityIssue['severity']) {
  return value === 'error' ? 'danger' : value === 'warning' ? 'warning' : 'info';
}

export default function ContinuityScreen() {
  const { data } = useWorkspace();
  const { authorizedFetch } = useAuth();
  const targets = useMemo(
    () => data.videoTargets.filter((target) => target.targetType === 'shot'),
    [data.videoTargets],
  );
  const [targetId, setTargetId] = useState(targets[0]?.targetId ?? '');
  const [photo, setPhoto] = useState<LocalImageAttachment | null>(null);
  const [report, setReport] = useState<ContinuityReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [takes, setTakes] = useState<ReviewComment[]>([]);
  const [takesLoading, setTakesLoading] = useState(false);
  const [takeNote, setTakeNote] = useState('');
  const [takeBest, setTakeBest] = useState(false);
  const [takeBusy, setTakeBusy] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const [repairSaved, setRepairSaved] = useState(false);
  const voiceBaseRef = useRef('');
  const voiceActiveRef = useRef(false);
  const project = data.activeProject;
  const target = targets.find((item) => item.targetId === targetId) ?? targets[0] ?? null;

  const loadTakes = useCallback(async () => {
    if (!project || !target) {
      setTakes([]);
      return;
    }
    setTakesLoading(true);
    try {
      const comments = await fetchReviewComments(
        workspaceApiBaseUrl,
        project.id,
        target.targetId,
        authorizedFetch,
      );
      setTakes(comments.filter((comment) => comment.kind === 'take'));
    } catch {
      setTakes([]);
    } finally {
      setTakesLoading(false);
    }
  }, [authorizedFetch, project, target]);

  useEffect(() => {
    void loadTakes();
    setTakeNote('');
    setTakeBest(false);
    setRepairSaved(false);
  }, [loadTakes]);

  useEffect(() => {
    const result = ExpoSpeechRecognitionModule.addListener('result', (event) => {
      const transcript = event.results[0]?.transcript ?? '';
      setTakeNote(appendVoiceTranscript(voiceBaseRef.current, transcript));
    });
    const start = ExpoSpeechRecognitionModule.addListener('start', () => {
      voiceActiveRef.current = true;
      setVoicePreparing(false);
      setRecognizing(true);
    });
    const end = ExpoSpeechRecognitionModule.addListener('end', () => {
      voiceActiveRef.current = false;
      setVoicePreparing(false);
      setRecognizing(false);
    });
    const onError = ExpoSpeechRecognitionModule.addListener('error', (event) => {
      voiceActiveRef.current = false;
      setVoicePreparing(false);
      setRecognizing(false);
      setError(voiceErrorMessage(event.error, event.message, event.code) ?? '语音备注失败');
    });
    return () => {
      voiceActiveRef.current = false;
      result.remove();
      start.remove();
      end.remove();
      onError.remove();
    };
  }, []);

  async function pickPhoto(source: 'camera' | 'library') {
    setError('');
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
            quality: 0.78,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.78,
            allowsMultipleSelection: false,
          });
      const attachment = readPickedImage(result);
      if (attachment) {
        setPhoto(attachment);
        setReport(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '照片读取失败');
    }
  }

  async function check() {
    if (!project || !target || !photo || checking) return;
    setChecking(true);
    setError('');
    try {
      const encoded = await attachmentToGenerationReference(photo);
      const next = await checkSceneContinuity(
        workspaceApiBaseUrl,
        {
          projectId: project.id,
          targetId: target.targetId,
          imageBase64: encoded.base64,
          mime: encoded.mime,
        },
        authorizedFetch,
      );
      setReport(next);
      setRepairSaved(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '现场检查失败');
    } finally {
      setChecking(false);
    }
  }

  async function toggleVoiceNote() {
    setError('');
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
      voiceActiveRef.current = false;
      setRecognizing(false);
      return;
    }
    if (voicePreparing) return;
    setVoicePreparing(true);
    try {
      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      const services = Platform.OS === 'android'
        ? ExpoSpeechRecognitionModule.getSpeechRecognitionServices()
        : [];
      const availability = voiceAvailabilityMessage({
        available,
        platform: Platform.OS,
        services,
      });
      if (availability) throw new Error(availability);
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) throw new Error('麦克风或语音识别权限未开启');
      voiceBaseRef.current = takeNote;
      setVoicePreparing(false);
      setRecognizing(true);
      voiceActiveRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: 'zh-CN',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    } catch (reason) {
      voiceActiveRef.current = false;
      setVoicePreparing(false);
      setRecognizing(false);
      setError(reason instanceof Error ? reason.message : '语音备注不可用');
    }
  }

  async function saveTake() {
    if (!project || !target || !takeNote.trim() || takeBusy) return;
    setTakeBusy('save');
    setError('');
    try {
      const saved = await createReviewComment(
        workspaceApiBaseUrl,
        project.id,
        {
          targetType: 'shot',
          targetId: target.targetId,
          body: takeNote,
          kind: 'take',
          isBest: takeBest,
          continuityStatus: report
            ? report.issues.length > 0 ? 'issues' : 'passed'
            : 'not_checked',
          continuitySummary: report?.summary ?? '',
          continuityIssueCount: report?.issues.length ?? 0,
        },
        authorizedFetch,
      );
      setTakes((current) => [
        saved,
        ...current.map((take) => saved.isBest ? { ...take, isBest: false } : take),
      ]);
      setTakeNote('');
      setTakeBest(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Take 保存失败');
    } finally {
      setTakeBusy('');
    }
  }

  async function markBest(take: ReviewComment) {
    if (!project || take.isBest || takeBusy) return;
    setTakeBusy(take.id);
    setError('');
    try {
      const updated = await markBestReviewComment(
        workspaceApiBaseUrl,
        project.id,
        take.id,
        authorizedFetch,
      );
      setTakes((current) => current.map((item) => ({
        ...item,
        isBest: item.id === updated.id,
      })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '好镜标记失败');
    } finally {
      setTakeBusy('');
    }
  }

  async function writeRepair() {
    if (!project || !target || !report || repairSaved || takeBusy) return;
    setTakeBusy('repair');
    setError('');
    try {
      const details = report.issues
        .map((issue) => `${AREA_LABELS[issue.area]}：${issue.suggestion}`)
        .join('；');
      await createReviewComment(
        workspaceApiBaseUrl,
        project.id,
        {
          targetType: 'shot',
          targetId: target.targetId,
          kind: 'reject',
          body: details || report.summary || '现场连续性检查发现偏差，需要返修。',
        },
        authorizedFetch,
      );
      setRepairSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '返修写入失败');
    } finally {
      setTakeBusy('');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <ScreenHeader
          kicker="SET CONTINUITY"
          title="现场连续性"
          left={<IconButton icon="arrow-left" label="返回 Agent" onPress={() => router.back()} />}
          right={
            <IconButton
              icon="list"
              label="打开返修队列"
              onPress={() => router.push('/repairs')}
            />
          }
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.title}>把现场照片和项目 Canon 对一遍</Text>
            <BodyText dim>只检查人物、地点、道具、光线和构图，照片不写入项目资产。</BodyText>
          </View>

          <Panel style={styles.targetCard}>
            <Kicker>当前镜头</Kicker>
            <Text style={styles.targetTitle}>{target?.targetLabel || '还没有可检查的镜头'}</Text>
            {targets.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.targetRail}>
                  {targets.slice(0, 12).map((item) => {
                    const active = item.targetId === target?.targetId;
                    return (
                      <Pressable
                        key={item.targetId}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        onPress={() => {
                          setTargetId(item.targetId);
                          setReport(null);
                        }}
                        style={[styles.targetChip, active && styles.targetChipActive]}
                      >
                        <Text style={[styles.targetChipText, active && styles.targetChipTextActive]}>
                          {item.targetLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            ) : null}
          </Panel>

          <Panel style={styles.photoCard}>
            {photo ? (
              <Image
                accessible
                accessibilityLabel="待检查的现场照片"
                contentFit="cover"
                source={{ uri: photo.uri }}
                style={styles.photo}
              />
            ) : (
              <View style={styles.photoEmpty}>
                <Feather name="camera" size={24} color={colors.textSecondary} />
                <Text style={styles.photoEmptyTitle}>拍下正在执行的现场</Text>
                <BodyText dim style={styles.center}>
                  对准演员造型、门口结构和关键道具，一次只检查一个镜头。
                </BodyText>
              </View>
            )}
            <View style={styles.sourceActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="拍照检查现场"
                onPress={() => void pickPhoto('camera')}
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
              >
                <Feather name="camera" size={16} color={colors.textSecondary} />
                <Text style={styles.secondaryText}>{photo ? '重新拍照' : '拍照'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="从相册选择现场照片"
                onPress={() => void pickPhoto('library')}
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
              >
                <Feather name="image" size={16} color={colors.textSecondary} />
                <Text style={styles.secondaryText}>相册</Text>
              </Pressable>
            </View>
            <View style={styles.actions}>
              <PrimaryButton
                label={checking ? '正在对照…' : '对照 Canon'}
                icon={checking ? 'loader' : 'check-circle'}
                disabled={!photo || !target || checking}
                onPress={() => void check()}
                style={styles.checkButton}
              />
            </View>
          </Panel>

          <Panel style={styles.takePanel}>
            <View style={styles.takeHead}>
              <View>
                <Kicker>现场 Take</Kicker>
                <Text style={styles.takeTitle}>记下这一条为什么值得留</Text>
              </View>
              <View style={styles.takeCount}>
                {takesLoading ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={styles.takeCountText}>{takes.length} 条</Text>
                )}
              </View>
            </View>

            {takes.length > 0 ? (
              <View style={styles.takeList}>
                {takes.slice(0, 6).map((take, index) => (
                  <View key={take.id} style={styles.takeRow}>
                    <View style={styles.takeRowHead}>
                      <Text style={styles.takeLabel}>
                        TAKE {String(takes.length - index).padStart(2, '0')}
                      </Text>
                      <View style={styles.takeBadges}>
                        {take.isBest ? <StatusBadge tone="success">好镜</StatusBadge> : null}
                        {take.continuityStatus !== 'not_checked' ? (
                          <StatusBadge tone={take.continuityStatus === 'passed' ? 'info' : 'warning'}>
                            {take.continuityStatus === 'passed' ? 'Canon 一致' : `${take.continuityIssueCount} 处偏差`}
                          </StatusBadge>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.takeBody}>{take.body}</Text>
                    {take.continuitySummary ? (
                      <Text style={styles.takeSummary}>{take.continuitySummary}</Text>
                    ) : null}
                    {!take.isBest ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={Boolean(takeBusy)}
                        onPress={() => void markBest(take)}
                        style={({ pressed }) => [styles.bestAction, pressed && styles.pressed]}
                      >
                        <Feather name="star" size={14} color={colors.info} />
                        <Text style={styles.bestActionText}>
                          {takeBusy === take.id ? '保存中…' : '设为好镜'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <TextInput
              accessibilityLabel="现场 Take 备注"
              multiline
              onChangeText={setTakeNote}
              placeholder="例如：雨停后第 3 条，演员转身更自然；门口灯光需要补暗。"
              placeholderTextColor={colors.textMuted}
              style={styles.takeInput}
              textAlignVertical="top"
              value={takeNote}
            />
            {voicePreparing ? (
              <Text style={styles.voiceState}>正在准备麦克风…</Text>
            ) : recognizing ? (
              <Text style={styles.voiceState}>正在听写语音备注 · 再次点麦克风停止</Text>
            ) : null}
            <View style={styles.takeActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={recognizing ? '停止语音备注' : '语音备注'}
                disabled={voicePreparing}
                onPress={() => void toggleVoiceNote()}
                style={({ pressed }) => [
                  styles.voiceAction,
                  recognizing && styles.voiceActionActive,
                  pressed && styles.pressed,
                ]}
              >
                {voicePreparing ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Feather
                    name={recognizing ? 'square' : 'mic'}
                    size={recognizing ? 15 : 18}
                    color={recognizing ? colors.accent : colors.textSecondary}
                  />
                )}
                <Text style={styles.voiceActionText}>语音备注</Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: takeBest }}
                onPress={() => setTakeBest((value) => !value)}
                style={({ pressed }) => [
                  styles.bestToggle,
                  takeBest && styles.bestToggleActive,
                  pressed && styles.pressed,
                ]}
              >
                <Feather
                  name={takeBest ? 'check-square' : 'square'}
                  size={16}
                  color={takeBest ? colors.success : colors.textMuted}
                />
                <Text style={[styles.bestToggleText, takeBest && styles.bestToggleTextActive]}>
                  好镜
                </Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={!takeNote.trim() || Boolean(takeBusy)}
              onPress={() => void saveTake()}
              style={({ pressed }) => [
                styles.takeSave,
                (!takeNote.trim() || Boolean(takeBusy)) && styles.takeSaveDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="save" size={15} color={colors.actionInk} />
              <Text style={styles.takeSaveText}>
                {takeBusy === 'save' ? '正在保存 Take…' : '保存现场 Take'}
              </Text>
            </Pressable>
          </Panel>

          {checking ? (
            <Panel style={styles.loading}>
              <ActivityIndicator color={colors.info} />
              <BodyText dim>正在读取当前定妆、地点锚点和 Canon。</BodyText>
            </Panel>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {report ? (
            <View style={styles.results}>
              <View style={styles.resultHead}>
                <View style={styles.resultCopy}>
                  <Kicker>检查结果</Kicker>
                  <Text style={styles.resultTitle}>{report.summary}</Text>
                </View>
                <StatusBadge tone={report.issues.length > 0 ? 'warning' : 'success'}>
                  {report.issues.length > 0 ? `${report.issues.length} 处偏差` : '与 Canon 一致'}
                </StatusBadge>
              </View>
              {report.issues.map((issue, index) => (
                <Panel key={`${issue.area}-${index}`} style={styles.issue}>
                  <View style={styles.issueHead}>
                    <Text style={styles.issueTitle}>{AREA_LABELS[issue.area]}</Text>
                    <StatusBadge tone={severityTone(issue.severity)}>
                      {issue.severity === 'error' ? '阻断' : issue.severity === 'warning' ? '提醒' : '说明'}
                    </StatusBadge>
                  </View>
                  <BodyText>期望：{issue.expected || '项目未写明'}</BodyText>
                  <BodyText>现场：{issue.observed}</BodyText>
                  {issue.evidence ? <Text style={styles.evidence}>证据：{issue.evidence}</Text> : null}
                  <Text style={styles.suggestion}>{issue.suggestion}</Text>
                  {issue.promptPatch ? (
                    <View style={styles.patch}>
                      <Kicker>提示词修正</Kicker>
                      <Text selectable style={styles.patchText}>{issue.promptPatch}</Text>
                    </View>
                  ) : null}
                </Panel>
              ))}
              {report.issues.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={repairSaved || Boolean(takeBusy)}
                  onPress={() => void writeRepair()}
                  style={({ pressed }) => [
                    styles.repairAction,
                    repairSaved && styles.repairActionSaved,
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather
                    name={repairSaved ? 'check' : 'corner-up-left'}
                    size={15}
                    color={repairSaved ? colors.success : colors.warningInk}
                  />
                  <Text style={[styles.repairActionText, repairSaved && styles.repairActionTextSaved]}>
                    {repairSaved
                      ? '已写入返修队列'
                      : takeBusy === 'repair'
                        ? '正在写入返修…'
                        : '把这组问题写入返修队列'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
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
  intro: { gap: 5 },
  title: { color: colors.text, fontSize: type.title, fontWeight: '600', lineHeight: 29 },
  targetCard: { padding: spacing.md, gap: spacing.xs },
  targetTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  targetRail: { flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.xs },
  targetChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  targetChipActive: { borderColor: colors.action, backgroundColor: colors.action },
  targetChipText: { color: colors.textSecondary, fontSize: type.micro },
  targetChipTextActive: { color: colors.actionInk, fontWeight: '600' },
  photoCard: { padding: spacing.sm, gap: spacing.sm },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radii.md, backgroundColor: colors.elevated },
  photoEmpty: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.lg },
  photoEmptyTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  center: { textAlign: 'center', maxWidth: 280 },
  sourceActions: { flexDirection: 'row', gap: spacing.xs },
  actions: { gap: spacing.xs },
  secondaryAction: {
    minHeight: 46,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
  },
  secondaryText: { color: colors.textSecondary, fontSize: type.label, fontWeight: '500' },
  checkButton: { width: '100%' },
  loading: { minHeight: 116, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  error: { color: colors.warningInk, fontSize: type.caption, lineHeight: 19 },
  results: { gap: spacing.sm },
  resultHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  resultCopy: { flex: 1, minWidth: 0, gap: 3 },
  resultTitle: { color: colors.text, fontSize: type.bodyLarge, fontWeight: '600', lineHeight: 23 },
  issue: { padding: spacing.md, gap: spacing.xs },
  issueHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  issueTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  evidence: { color: colors.textMuted, fontSize: type.caption, lineHeight: 18 },
  suggestion: { color: colors.text, fontSize: type.caption, lineHeight: 19, fontWeight: '500' },
  patch: { gap: 3, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.elevated },
  patchText: { color: colors.textSecondary, fontSize: type.micro, lineHeight: 17 },
  takePanel: { padding: spacing.md, gap: spacing.sm },
  takeHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  takeTitle: { marginTop: 3, color: colors.text, fontSize: type.body, fontWeight: '600' },
  takeCount: { minHeight: 24, justifyContent: 'center' },
  takeCountText: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.micro,
  },
  takeList: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  takeRow: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  takeRowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  takeLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: type.micro,
    fontWeight: '600',
  },
  takeBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
  takeBody: { color: colors.text, fontSize: type.caption, lineHeight: 19 },
  takeSummary: { color: colors.textMuted, fontSize: type.micro, lineHeight: 16 },
  bestAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingRight: spacing.sm,
  },
  bestActionText: { color: colors.info, fontSize: type.caption, fontWeight: '600' },
  takeInput: {
    minHeight: 82,
    color: colors.text,
    fontSize: type.caption,
    lineHeight: 19,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  voiceState: { color: colors.info, fontSize: type.micro },
  takeActions: { flexDirection: 'row', gap: spacing.xs },
  voiceAction: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
  },
  voiceActionActive: {
    borderColor: 'rgba(184,101,79,0.36)',
    backgroundColor: colors.accentSoft,
  },
  voiceActionText: { color: colors.textSecondary, fontSize: type.caption, fontWeight: '600' },
  bestToggle: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
  },
  bestToggleActive: {
    borderColor: 'rgba(112,128,107,0.35)',
    backgroundColor: 'rgba(112,128,107,0.08)',
  },
  bestToggleText: { color: colors.textMuted, fontSize: type.caption, fontWeight: '600' },
  bestToggleTextActive: { color: colors.successInk },
  takeSave: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: radii.md,
    backgroundColor: colors.action,
  },
  takeSaveDisabled: { opacity: 0.34 },
  takeSaveText: { color: colors.actionInk, fontSize: type.caption, fontWeight: '600' },
  repairAction: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(184,101,79,0.28)',
    borderRadius: radii.md,
    backgroundColor: 'rgba(184,101,79,0.04)',
  },
  repairActionSaved: {
    borderColor: 'rgba(112,128,107,0.28)',
    backgroundColor: 'rgba(112,128,107,0.06)',
  },
  repairActionText: { color: colors.warningInk, fontSize: type.caption, fontWeight: '600' },
  repairActionTextSaved: { color: colors.successInk },
  pressed: { opacity: 0.72 },
});
