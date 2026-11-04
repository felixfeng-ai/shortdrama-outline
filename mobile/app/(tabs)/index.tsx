import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, type ElementRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentComposer } from '@/components/agent-composer';
import { AgentTurn } from '@/components/agent-turn';
import { SceneFrame } from '@/components/scene-frame';
import {
  BodyText,
  BrandLockup,
  IconButton,
  Kicker,
  Panel,
  ScreenFade,
  SecondaryButton,
  StatusDot,
} from '@/components/ui';
import { colors, spacing, type } from '@/constants/tokens';
import {
  AGENT_PROMPTS,
  agentSessionReducer,
  initialAgentSessionState,
} from '@/lib/agent-session';
import { applyAgentSuggestion, mapAgentResponse, runAgentTurn } from '@/lib/agent-api';
import { useAuth } from '@/lib/auth-store';
import { useWorkspace } from '@/lib/workspace-store';
import { workspaceApiBaseUrl, workspaceToAgentContext } from '@/lib/workspace-api';

export default function AgentHomeScreen() {
  const { data, status, error, refresh } = useWorkspace();
  const { authorizedFetch } = useAuth();
  const [session, dispatch] = useReducer(agentSessionReducer, initialAgentSessionState);
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null);
  const requestRef = useRef<AbortController | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const project = data.activeProject;
  const hero = data.hero;
  const hasProject = !!project;
  const projectContext = workspaceToAgentContext(data, project);
  const syncLabel =
    status === 'loading'
      ? '同步中'
      : status === 'synced'
        ? '已同步'
        : status === 'cached'
          ? '使用缓存 · 重试'
        : status === 'error'
          ? '同步失败 · 重试'
          : '本地草稿';
  const syncColor =
    status === 'loading'
      ? colors.info
      : status === 'synced'
        ? colors.success
        : status === 'error'
          ? colors.warning
          : colors.textMuted;

  const stopCurrentTurn = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    dispatch({ type: 'stop' });
  }, []);

  const sendPrompt = useCallback(() => {
    const prompt = session.draft.trim();
    if (!project || !prompt || session.phase === 'working' || session.phase === 'proposed') return;

    dispatch({ type: 'submit', context: projectContext });
    requestRef.current?.abort();
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    if (status !== 'synced' || !workspaceApiBaseUrl) {
      fallbackTimerRef.current = setTimeout(() => {
        fallbackTimerRef.current = null;
        dispatch({ type: 'complete' });
      }, 700);
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    void runAgentTurn(
      workspaceApiBaseUrl,
      { projectId: project.id, prompt },
      authorizedFetch,
      controller.signal,
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        dispatch({
          type: 'complete',
          result: mapAgentResponse(response, projectContext),
        });
        refresh();
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        dispatch({
          type: 'fail',
          message: reason instanceof Error ? reason.message : 'AI 场记暂时没有回应',
        });
      })
      .finally(() => {
        if (requestRef.current === controller) requestRef.current = null;
      });
  }, [
    project,
    projectContext,
    refresh,
    authorizedFetch,
    session.draft,
    session.phase,
    status,
  ]);

  const acceptProposal = useCallback(() => {
    if (!project || !session.shotEdit || !session.baseShotsSnapshotId || !workspaceApiBaseUrl) {
      dispatch({ type: 'accept' });
      return;
    }

    dispatch({ type: 'start-apply' });
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    void applyAgentSuggestion(
      workspaceApiBaseUrl,
      {
        projectId: project.id,
        baseSnapshotId: session.baseShotsSnapshotId,
        edit: session.shotEdit,
      },
      authorizedFetch,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        dispatch({ type: 'apply-success', version: result.version });
        refresh();
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        dispatch({
          type: 'apply-fail',
          message: reason instanceof Error ? reason.message : '写入项目失败',
        });
      })
      .finally(() => {
        if (requestRef.current === controller) requestRef.current = null;
      });
  }, [
    authorizedFetch,
    project,
    refresh,
    session.baseShotsSnapshotId,
    session.shotEdit,
  ]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (session.phase === 'idle') return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [session.phase]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenFade>
        <View style={styles.topBar}>
          <BrandLockup />
          <View style={styles.topActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="切换当前项目"
              onPress={() => router.push('/projects')}
              style={({ pressed }) => [styles.projectPill, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.projectPillText}>
                {project ? `${project.title}${hero ? ` · 第 ${hero.episodeNumber} 集` : ''}` : '选择项目'}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.textMuted} />
            </Pressable>
            <IconButton icon="user" label="账户与同步" onPress={() => router.push('/me')} />
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}
          style={styles.body}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contextLine}>
              <Kicker>
                {project ? `正在写 · ${hero?.contextBadge ?? project.step}` : '还没有项目'}
              </Kicker>
              <Pressable
                accessibilityRole={status === 'error' ? 'button' : undefined}
                accessibilityLabel={
                  status === 'error' && error ? `${syncLabel}：${error}` : syncLabel
                }
                disabled={status !== 'error'}
                hitSlop={10}
                onPress={refresh}
                style={styles.savedRow}
              >
                <StatusDot pulse={status === 'loading'} color={syncColor} />
                <Text style={styles.savedText}>{syncLabel}</Text>
              </Pressable>
            </View>

            <Text numberOfLines={2} style={styles.question}>
              {project ? '这一场，要留下什么余味？' : '先选一个项目。'}
            </Text>
            <Text numberOfLines={2} style={styles.sceneMeta}>
              {hero
                ? [hero.sceneLocation, hero.timeOfDay, hero.sceneSummary].filter(Boolean).join(' · ')
                : project
                  ? `${project.title} · 还没有场次`
                  : '新建或导入项目后，AI 场记会读取当前进度。'}
            </Text>

            {hasProject && hero ? (
              <SceneFrame compact label={hero.sceneLocation} style={styles.scene} />
            ) : (
              <Panel style={styles.emptyScene}>
                <Text style={styles.emptyTitle}>
                  {hasProject ? '这个项目还没有场次' : '还没有项目'}
                </Text>
                <BodyText dim>
                  {hasProject
                    ? '先在项目里完成分集与场景，Agent 才能读到可继续的当前场次。'
                    : '创建项目或导入项目包后，这里会出现当前场次与可执行下一步。'}
                </BodyText>
                <SecondaryButton
                  label={hasProject ? '打开项目' : '创建或导入项目'}
                  icon="folder-plus"
                  onPress={() => router.push('/projects')}
                  style={styles.emptyAction}
                />
              </Panel>
            )}

            {hasProject ? (
              <>
                <View style={styles.modeSwitch} accessibilityRole="tablist">
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: session.mode === 'chat' }}
                    onPress={() => dispatch({ type: 'mode', mode: 'chat' })}
                    style={({ pressed }) => [
                      styles.modeButton,
                      session.mode === 'chat' && styles.modeButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.modeText, session.mode === 'chat' && styles.modeTextActive]}>
                      对话
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: session.mode === 'create' }}
                    onPress={() => dispatch({ type: 'mode', mode: 'create' })}
                    style={({ pressed }) => [
                      styles.modeButton,
                      session.mode === 'create' && styles.modeButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.modeText, session.mode === 'create' && styles.modeTextActive]}>
                      创作
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.promptList}>
                  {AGENT_PROMPTS[session.mode].map((prompt) => (
                    <Pressable
                      key={prompt}
                      accessibilityRole="button"
                      accessibilityLabel={prompt}
                      disabled={[
                        'working',
                        'proposed',
                        'applying',
                        'apply-error',
                      ].includes(session.phase)}
                      onPress={() => dispatch({ type: 'draft', value: prompt })}
                      style={({ pressed }) => [styles.promptChip, pressed && styles.pressed]}
                    >
                      <Text style={styles.promptText}>{prompt}</Text>
                      <Feather name="arrow-up-right" size={14} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </View>

                <AgentTurn
                  session={session}
                  projectContext={projectContext}
                  onAccept={acceptProposal}
                  onDismiss={() => dispatch({ type: 'dismiss' })}
                  onReview={() => router.push('/tasks')}
                  onRetry={sendPrompt}
                />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="查看生成与审片任务"
                  onPress={() => router.push('/tasks')}
                  style={({ pressed }) => [styles.runningStrip, pressed && styles.pressed]}
                >
                  <StatusDot color={colors.textMuted} />
                  <Text style={styles.runningText}>生成与审片</Text>
                  <Text numberOfLines={1} style={styles.runningTarget}>查看任务</Text>
                  <Feather name="chevron-right" size={15} color={colors.textMuted} />
                </Pressable>
              </>
            ) : null}
          </ScrollView>

          <AgentComposer
            mode={session.mode}
            phase={session.phase}
            value={session.draft}
            disabled={!hasProject}
            onChangeText={(value) => dispatch({ type: 'draft', value })}
            onSend={sendPrompt}
            onStop={stopCurrentTurn}
            onToggleMode={() =>
              dispatch({ type: 'mode', mode: session.mode === 'chat' ? 'create' : 'chat' })
            }
          />
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
  topBar: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.canvas,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  projectPill: {
    minHeight: 44,
    maxWidth: 166,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  projectPillText: {
    flexShrink: 1,
    color: colors.text,
    fontSize: type.caption,
    fontWeight: '500',
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  contextLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  savedText: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  question: {
    marginTop: spacing.md,
    color: colors.text,
    fontSize: 27,
    fontWeight: '600',
    lineHeight: 35,
  },
  sceneMeta: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: type.caption,
    lineHeight: 19,
  },
  scene: {
    width: '100%',
    marginTop: spacing.md,
    aspectRatio: 16 / 9,
    borderRadius: 8,
  },
  emptyScene: {
    minHeight: 156,
    marginTop: spacing.lg,
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  emptyAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  modeSwitch: {
    minHeight: 52,
    marginTop: spacing.md,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    padding: 4,
  },
  modeButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  modeButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.text,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  modeText: {
    color: colors.textMuted,
    fontSize: type.label,
    fontWeight: '500',
  },
  modeTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  promptList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  promptChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  promptText: {
    color: colors.textSecondary,
    fontSize: type.caption,
    fontWeight: '500',
  },
  runningStrip: {
    minHeight: 46,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  runningText: {
    color: colors.textSecondary,
    fontSize: type.caption,
  },
  runningTarget: {
    flex: 1,
    color: colors.textMuted,
    fontSize: type.micro,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.72,
  },
});
