import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  Divider,
  IconButton,
  Kicker,
  MonoText,
  Panel,
  PrimaryButton,
  ScreenFade,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import { downloadAuthenticatedFile } from '@/lib/asset-download';
import { useAuth } from '@/lib/auth-store';
import {
  fetchReviewState,
  selectReviewAsset,
  type ReviewAsset,
  type ReviewState,
} from '@/lib/review-api';
import {
  buildReviewImageSource,
  initialReviewAsset,
  reviewAspectRatio,
  reviewBytes,
  reviewCreatedAt,
  reviewFileName,
  reviewVersionLabel,
  reviewVersions,
} from '@/lib/review-view';
import { workspaceApiBaseUrl, type WorkspaceTaskTargetType } from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';

const TARGET_TYPES: WorkspaceTaskTargetType[] = ['shot', 'character', 'place'];

function readTargetType(value: string | string[] | undefined): WorkspaceTaskTargetType {
  const candidate = Array.isArray(value) ? value[0] : value;
  return TARGET_TYPES.includes(candidate as WorkspaceTaskTargetType)
    ? candidate as WorkspaceTaskTargetType
    : 'shot';
}

function readParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default function ReviewScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    projectId?: string | string[];
    targetType?: string | string[];
    targetId?: string | string[];
    targetLabel?: string | string[];
  }>();
  const preferredId = readParam(params.id);
  const linkedProjectId = readParam(params.projectId);
  const targetId = readParam(params.targetId);
  const targetType = readTargetType(params.targetType);
  const targetLabel = readParam(params.targetLabel) || '生成资产';
  const { selectedProjectId, data, status: workspaceStatus } = useWorkspace();
  const projectId =
    linkedProjectId ||
    (selectedProjectId ??
      (workspaceStatus === 'synced' || workspaceStatus === 'demo'
        ? data.activeProject?.id ?? ''
        : ''));
  const { authorizedFetch, getAccessHeaders } = useAuth();
  const [state, setState] = useState<ReviewState>({ tasks: [], assets: [] });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imageHeaders, setImageHeaders] = useState<Record<string, string>>({});
  const controllerRef = useRef<AbortController | null>(null);

  const versions = useMemo(() => reviewVersions(state.assets), [state.assets]);
  const current = versions.find((asset) => asset.id === currentId) ?? null;

  const load = useCallback(() => {
    if (workspaceStatus === 'loading') {
      setLoading(true);
      return;
    }
    if (!projectId || !targetId || !workspaceApiBaseUrl) {
      setLoading(false);
      setError(!projectId ? '当前项目尚未同步' : '审片参数不完整');
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    void fetchReviewState(
      workspaceApiBaseUrl,
      projectId,
      targetType,
      targetId,
      authorizedFetch,
      controller.signal,
    )
      .then((next) => {
        if (controller.signal.aborted) return;
        const ordered = reviewVersions(next.assets);
        const nextAsset = initialReviewAsset(ordered, preferredId);
        setState(next);
        setCurrentId(nextAsset?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : '审片数据读取失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [authorizedFetch, preferredId, projectId, targetId, targetType, workspaceStatus]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  useEffect(() => {
    let active = true;
    void getAccessHeaders().then((headers) => {
      if (active) setImageHeaders(headers);
    });
    return () => {
      active = false;
    };
  }, [getAccessHeaders]);

  async function adoptCurrent() {
    if (!current || !projectId || current.selectedAt || selecting) return;
    setSelecting(true);
    setError('');
    try {
      const selected = await selectReviewAsset(
        workspaceApiBaseUrl,
        projectId,
        current.id,
        authorizedFetch,
      );
      setState((previous) => ({
        ...previous,
        assets: previous.assets.map((asset) => ({
          ...asset,
          selectedAt: asset.id === selected.id ? selected.selectedAt : null,
        })),
      }));
      setCurrentId(selected.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '采用失败');
    } finally {
      setSelecting(false);
    }
  }

  async function downloadCurrent() {
    if (!current || downloading) return;
    setDownloading(true);
    setError('');
    try {
      const headers = await getAccessHeaders();
      const source = buildReviewImageSource(workspaceApiBaseUrl, current, headers);
      await downloadAuthenticatedFile({
        url: source.uri,
        fileName: reviewFileName(current),
        mime: current.mime,
        fetchImpl: authorizedFetch,
        headers,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '下载失败');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <View style={styles.topBar}>
          <IconButton icon="arrow-left" label="返回任务" onPress={() => router.back()} />
          <View style={styles.topCopy}>
            <Kicker>ASSET REVIEW</Kicker>
            <Text numberOfLines={1} style={styles.topTitle}>{targetLabel}</Text>
          </View>
          <View style={styles.topActions}>
            <IconButton
              icon="flag"
              label="举报当前资产"
              onPress={() => router.push({
                pathname: '/report',
                params: {
                  projectId,
                  targetType: 'asset',
                  targetId: preferredId,
                },
              })}
            />
            <IconButton
              icon="refresh-cw"
              label="刷新审片"
              active={loading}
              onPress={load}
            />
          </View>
        </View>

        {loading && !current ? (
          <StateView loading title="正在读取生成资产" body="同步当前目标的全部版本。" />
        ) : error && !current ? (
          <StateView
            title="审片暂时打不开"
            body={error}
            action={<SecondaryButton label="重新同步" icon="refresh-cw" onPress={load} />}
          />
        ) : !current ? (
          <StateView
            title="还没有生成资产"
            body="生成完成后，真实版本会出现在这里。"
            action={<SecondaryButton label="返回任务" icon="arrow-left" onPress={() => router.back()} />}
          />
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.previewWrap}>
                <Image
                  accessible
                  accessibilityLabel={`${targetLabel}，${reviewVersionLabel(versions, versions.indexOf(current))}`}
                  contentFit="contain"
                  source={buildReviewImageSource(
                    workspaceApiBaseUrl,
                    current,
                    imageHeaders,
                  )}
                  style={[
                    styles.preview,
                    { aspectRatio: reviewAspectRatio(current.targetType) },
                  ]}
                  transition={160}
                />
                <View style={styles.aiBadge}>
                  <Feather name="cpu" size={12} color={colors.actionInk} />
                  <Text style={styles.aiBadgeText}>AI 生成</Text>
                </View>
              </View>

              <View style={styles.versionHead}>
                <View>
                  <Kicker>版本</Kicker>
                  <Text style={styles.sectionTitle}>
                    {reviewVersionLabel(versions, versions.indexOf(current))}
                    <Text style={styles.versionCount}> · 共 {versions.length} 版</Text>
                  </Text>
                </View>
                <StatusBadge tone={current.selectedAt ? 'success' : 'warning'}>
                  {current.selectedAt ? '当前采用' : '候选版本'}
                </StatusBadge>
              </View>

              <ScrollView
                horizontal
                contentContainerStyle={styles.versionRail}
                showsHorizontalScrollIndicator={false}
              >
                {versions.map((asset, index) => {
                  const selected = asset.id === current.id;
                  return (
                    <Pressable
                      key={asset.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${reviewVersionLabel(versions, index)}${asset.selectedAt ? '，当前采用' : ''}`}
                      accessibilityState={{ selected }}
                      onPress={() => setCurrentId(asset.id)}
                      style={({ pressed }) => [
                        styles.versionCard,
                        selected && styles.versionCardSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Image
                        accessible={false}
                        contentFit="cover"
                        source={buildReviewImageSource(
                          workspaceApiBaseUrl,
                          asset,
                          imageHeaders,
                        )}
                        style={styles.versionImage}
                      />
                      <View style={styles.versionLabelRow}>
                        <Text style={[styles.versionLabel, selected && styles.versionLabelSelected]}>
                          {reviewVersionLabel(versions, index)}
                        </Text>
                        {asset.selectedAt ? (
                          <Feather name="check" size={13} color={colors.success} />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Panel style={styles.detailCard}>
                <View style={styles.detailHead}>
                  <Kicker>资产信息</Kicker>
                  <MonoText>{current.mime.replace('image/', '').toUpperCase()}</MonoText>
                </View>
                <Divider />
                <DetailRow label="生成时间" value={reviewCreatedAt(current.createdAt)} />
                <DetailRow label="文件大小" value={reviewBytes(current.bytes)} />
                <DetailRow label="模型" value={current.model || '未记录'} />
                <DetailRow label="来源" value={current.providerId || '未记录'} />
                <DetailRow label="任务" value={current.taskId.slice(0, 12)} />
              </Panel>

              {error ? (
                <Panel style={styles.inlineError}>
                  <Feather name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.inlineErrorText}>{error}</Text>
                </Panel>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <SecondaryButton
                label={downloading ? '下载中…' : '下载当前版'}
                icon="download"
                disabled={downloading || selecting}
                onPress={() => void downloadCurrent()}
                style={styles.footerButton}
              />
              <PrimaryButton
                label={
                  current.selectedAt
                    ? '当前采用'
                    : selecting
                      ? '采用中…'
                      : '采用此版'
                }
                icon={current.selectedAt ? 'check-circle' : selecting ? 'loader' : 'check'}
                disabled={Boolean(current.selectedAt) || selecting || downloading}
                onPress={() => void adoptCurrent()}
                style={styles.footerButton}
              />
            </View>
          </>
        )}
      </ScreenFade>
    </SafeAreaView>
  );
}

function StateView({
  title,
  body,
  action,
  loading = false,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  loading?: boolean;
}) {
  return (
    <View style={styles.state}>
      {loading ? <ActivityIndicator color={colors.textSecondary} /> : (
        <View style={styles.stateIcon}>
          <Feather name="image" size={20} color={colors.textSecondary} />
        </View>
      )}
      <Text style={styles.stateTitle}>{title}</Text>
      <BodyText dim style={styles.stateBody}>{body}</BodyText>
      {action}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  topBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  topActions: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  topTitle: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  previewWrap: {
    position: 'relative',
    width: '100%',
    maxWidth: 330,
    alignSelf: 'center',
  },
  preview: {
    width: '100%',
    maxHeight: 560,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  aiBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(25,26,24,0.72)',
    paddingHorizontal: 8,
  },
  aiBadgeText: {
    color: colors.actionInk,
    fontSize: type.micro,
    fontWeight: '600',
  },
  versionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  versionCount: {
    color: colors.textMuted,
    fontSize: type.caption,
    fontWeight: '400',
  },
  versionRail: {
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  versionCard: {
    width: 92,
    minHeight: 86,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  versionCardSelected: {
    borderColor: 'rgba(184,101,79,0.5)',
    backgroundColor: colors.accentSoft,
  },
  versionImage: {
    width: '100%',
    height: 58,
    backgroundColor: colors.elevated,
  },
  versionLabelRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  versionLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: type.caption,
    fontWeight: '600',
  },
  versionLabelSelected: {
    color: colors.action,
  },
  detailCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
  },
  detailRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: type.caption,
  },
  detailValue: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: type.caption,
    textAlign: 'right',
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderColor: 'rgba(184,78,68,0.24)',
    backgroundColor: 'rgba(184,78,68,0.04)',
  },
  inlineErrorText: {
    flex: 1,
    color: colors.warningInk,
    fontSize: type.caption,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xl,
  },
  stateIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  stateTitle: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  stateBody: {
    maxWidth: 260,
    textAlign: 'center',
    fontSize: type.caption,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.72,
  },
});
