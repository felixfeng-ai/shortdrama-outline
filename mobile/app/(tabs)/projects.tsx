import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SceneFrame } from '@/components/scene-frame';
import {
  BodyText,
  Divider,
  IconButton,
  Kicker,
  MonoText,
  Panel,
  PrimaryButton,
  ProgressTrack,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { completionPercent } from '@/lib/app-data';
import { colors, fonts, spacing, type } from '@/constants/tokens';
import { useWorkspace } from '@/lib/workspace-store';
import { readPickedProjectPackage } from '@/lib/project-package';

export default function ProjectsScreen() {
  const {
    data,
    status,
    createProject,
    selectProject,
    loadSampleProject,
    importProject,
  } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');
  const [busyAction, setBusyAction] = useState<'create' | 'sample' | 'import' | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const current = data.activeProject;
  const projects = data.projects;
  const hero = data.hero;
  const syncLabel =
    status === 'loading'
      ? '同步中'
      : status === 'synced'
        ? '已同步'
        : status === 'error'
          ? '同步失败'
          : '本地草稿';

  async function openProject(projectId: string) {
    setActionError('');
    await selectProject(projectId);
    router.replace('/');
  }

  async function createNewProject() {
    try {
      setBusyAction('create');
      setActionError('');
      const project = await createProject(projectTitle);
      setCreateOpen(false);
      setProjectTitle('');
      setNotice(`已创建「${project.title}」`);
      router.replace('/');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '创建项目失败');
    } finally {
      setBusyAction(null);
    }
  }

  async function importPackage() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets[0]) return;
      setBusyAction('import');
      setActionError('');
      setNotice('');
      const form = await readPickedProjectPackage(picked.assets[0]);
      const result = await importProject(form);
      const warning = result.warnings.length ? `，${result.warnings.length} 条警告` : '';
      setNotice(`已导入「${result.project.title}」，恢复 ${result.counts.snapshots} 个快照${warning}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '项目包导入失败');
    } finally {
      setBusyAction(null);
    }
  }

  async function startFromSample() {
    try {
      setBusyAction('sample');
      setActionError('');
      const project = await loadSampleProject();
      setNotice(`已载入「${project.title}」`);
      router.replace('/');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '示例载入失败');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="PROJECTS"
          title="项目"
          left={<IconButton icon="arrow-left" label="返回 Agent" onPress={() => router.back()} />}
          right={
            <IconButton
              icon="plus"
              label="新建项目"
              active
              onPress={() => {
                setProjectTitle('');
                setActionError('');
                setCreateOpen(true);
              }}
            />
          }
        />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {current ? (
            <Panel elevated style={styles.currentCard}>
              <View style={styles.currentTop}>
                <View style={styles.currentCopy}>
                  <View style={styles.currentMeta}>
                    <StatusBadge tone="action">当前项目</StatusBadge>
                    <Text style={styles.updated}>{syncLabel} · {current.updatedLabel}</Text>
                  </View>
                  <Text numberOfLines={2} style={styles.currentTitle}>{current.title}</Text>
                  <Text numberOfLines={1} style={styles.currentSubtitle}>
                    {current.episode || '待载入'} · {current.step} · {current.shotCount} 个镜头
                  </Text>
                </View>
                <View style={styles.percent}>
                  <Text style={styles.percentValue}>{completionPercent(current)}</Text>
                  <Text style={styles.percentUnit}>%</Text>
                </View>
              </View>
              <ProgressTrack value={completionPercent(current)} />
              <View style={styles.currentBody}>
                <SceneFrame compact label={hero?.sceneLocation ?? current.title} style={styles.currentThumb} />
                <View style={styles.currentBodyCopy}>
                  <Kicker>下一步</Kicker>
                  <Text numberOfLines={2} style={styles.currentNext}>
                    {current.step === '分镜' ? '检查当前场次与下一镜衔接' : `继续完成${current.step}`}
                  </Text>
                  <BodyText dim>
                    {hero
                      ? `${hero.sceneLocation} · ${hero.sceneSummary || '当前场次还没有摘要'}`
                      : '这个项目还没有场次，先完成分集与场景。'}
                  </BodyText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`继续创作${current.title}`}
                    onPress={() => router.replace('/')}
                    style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.continueText}>继续创作</Text>
                    <Feather name="arrow-up-right" size={16} color={colors.actionInk} />
                  </Pressable>
                </View>
              </View>
            </Panel>
          ) : (
            <Panel elevated style={styles.emptyCard}>
              <Text style={styles.currentTitle}>还没有项目</Text>
              <BodyText dim>创建一个项目，或导入已有项目包后再开始创作。</BodyText>
            </Panel>
          )}

          <View style={styles.sectionHead}>
            <View>
              <Kicker>全部项目</Kicker>
              <Text style={styles.sectionTitle}>最近修改</Text>
            </View>
            <MonoText>
              {projects.length < data.totalProjects
                ? `${projects.length} / ${data.totalProjects}`
                : `${data.totalProjects} 个项目`}
            </MonoText>
          </View>

          {projects.length > 0 ? (
            <View style={styles.projectList}>
              {projects.map((project, index) => (
              <Pressable
                key={project.id}
                accessibilityRole="button"
                accessibilityLabel={`打开${project.title}`}
                accessibilityState={{ selected: project.id === current?.id }}
                onPress={() => void openProject(project.id)}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Panel style={styles.projectRow}>
                  <View style={styles.projectMark}>
                    <Text style={styles.projectMarkText}>{project.title.slice(0, 1)}</Text>
                  </View>
                  <View style={styles.projectRowCopy}>
                    <View style={styles.projectRowHead}>
                      <Text style={styles.projectRowTitle}>{project.title}</Text>
                      <Text style={styles.projectRowUpdated}>{project.updatedLabel}</Text>
                    </View>
                    <Text style={styles.projectRowMeta}>
                      {project.hasDetails
                        ? `${project.episode || '待载入'} · ${project.step} · ${project.completedSteps}/6 步`
                        : '已同步 · 打开后载入集数与进度'}
                    </Text>
                    {project.hasDetails ? (
                      <ProgressTrack
                        value={completionPercent(project)}
                        color={project.status === 'complete' ? colors.success : colors.action}
                      />
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </Panel>
                {index < projects.length - 1 ? <Divider /> : null}
              </Pressable>
              ))}
            </View>
          ) : (
            <Panel style={styles.emptyCard}>
              <BodyText dim>当前工作区没有项目。可从下方导入，或在 Web 工作台新建项目。</BodyText>
            </Panel>
          )}

          <View style={styles.importRow}>
            <Pressable
              accessibilityRole="button"
              disabled={busyAction !== null}
              onPress={() => void importPackage()}
              style={({ pressed }) => [
                styles.importButton,
                busyAction !== null && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {busyAction === 'import' ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Feather name="upload" size={17} color={colors.textSecondary} />
              )}
              <Text style={styles.importText}>
                {busyAction === 'import' ? '正在导入…' : '导入项目包'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busyAction !== null}
              onPress={() => void startFromSample()}
              style={({ pressed }) => [
                styles.importButton,
                busyAction !== null && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {busyAction === 'sample' ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Feather name="copy" size={17} color={colors.textSecondary} />
              )}
              <Text style={styles.importText}>
                {busyAction === 'sample' ? '正在载入…' : '从示例开始'}
              </Text>
            </Pressable>
          </View>

          {notice ? (
            <Panel style={styles.noticeCard}>
              <Feather name="check-circle" size={16} color={colors.info} />
              <Text style={styles.noticeText}>{notice}</Text>
            </Panel>
          ) : null}
          {actionError ? (
            <Panel style={styles.errorCard}>
              <Feather name="alert-circle" size={16} color={colors.warning} />
              <Text style={styles.errorText}>{actionError}</Text>
            </Panel>
          ) : null}
        </ScrollView>
      </ScreenFade>

      <Modal
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
        transparent
        visible={createOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalScrim}
        >
          <Pressable
            accessibilityLabel="关闭新建项目"
            onPress={() => setCreateOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <Panel elevated style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View>
                <Kicker>NEW PROJECT</Kicker>
                <Text style={styles.modalTitle}>给这部戏起个名字</Text>
              </View>
              <IconButton icon="x" label="关闭新建项目" onPress={() => setCreateOpen(false)} />
            </View>
            <TextInput
              accessibilityLabel="新项目名称"
              autoFocus
              maxLength={100}
              onChangeText={setProjectTitle}
              onSubmitEditing={() => void createNewProject()}
              placeholder="例如：夜港来信"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              style={styles.modalInput}
              value={projectTitle}
            />
            {actionError ? <Text style={styles.modalError}>{actionError}</Text> : null}
            <View style={styles.modalActions}>
              <SecondaryButton
                label="取消"
                disabled={busyAction === 'create'}
                onPress={() => setCreateOpen(false)}
                style={styles.flexButton}
              />
              <PrimaryButton
                label={busyAction === 'create' ? '正在创建…' : '创建项目'}
                icon="arrow-right"
                disabled={busyAction === 'create' || !projectTitle.trim()}
                onPress={() => void createNewProject()}
                style={styles.flexButton}
              />
            </View>
          </Panel>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  currentCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyCard: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  currentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  currentCopy: {
    flex: 1,
    minWidth: 0,
  },
  currentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  updated: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  currentTitle: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 32,
  },
  currentSubtitle: {
    color: colors.textSecondary,
    fontSize: type.label,
  },
  percent: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  percentValue: {
    color: colors.action,
    fontFamily: fonts.mono,
    fontSize: 30,
    fontWeight: '600',
  },
  percentUnit: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.caption,
  },
  currentBody: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  currentThumb: {
    width: 112,
    flexShrink: 0,
  },
  currentBodyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  currentNext: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  continueButton: {
    minHeight: 44,
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: 8,
    backgroundColor: colors.action,
  },
  continueText: {
    color: colors.actionInk,
    fontSize: type.label,
    fontWeight: '600',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  projectList: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  projectRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 0,
    borderRadius: 0,
    padding: spacing.sm,
  },
  projectMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.elevated,
  },
  projectMarkText: {
    color: colors.textSecondary,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  projectRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  projectRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  projectRowTitle: {
    flex: 1,
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  projectRowUpdated: {
    color: colors.textMuted,
    fontSize: type.micro,
  },
  projectRowMeta: {
    color: colors.textSecondary,
    fontSize: type.caption,
  },
  importRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  importButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  importText: {
    color: colors.textSecondary,
    fontSize: type.caption,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.5,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: 'rgba(92,117,111,0.06)',
  },
  noticeText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: type.caption,
    lineHeight: 19,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: 'rgba(184,101,79,0.07)',
  },
  errorText: {
    flex: 1,
    color: colors.warningInk,
    fontSize: type.caption,
    lineHeight: 19,
  },
  modalScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
    padding: spacing.md,
  },
  modalCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 8,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  modalTitle: {
    marginTop: 2,
    color: colors.text,
    fontSize: type.bodyLarge,
    fontWeight: '600',
  },
  modalInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 8,
    backgroundColor: colors.canvas,
    color: colors.text,
    fontSize: type.bodyLarge,
    paddingHorizontal: spacing.sm,
  },
  modalError: {
    color: colors.warningInk,
    fontSize: type.caption,
    lineHeight: 19,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  flexButton: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});

