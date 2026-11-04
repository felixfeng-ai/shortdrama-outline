import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import {
  BodyText,
  Kicker,
  Panel,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StatusDot,
} from '@/components/ui';
import { colors, spacing, type } from '@/constants/tokens';
import { agentIntro, type AgentSessionState } from '@/lib/agent-session';
import { toolLabel } from '@/lib/agent-api';
import type { AgentProjectContext } from '@/lib/workspace-api';

export function AgentTurn({
  session,
  projectContext,
  onAccept,
  onDismiss,
  onReview,
  onRetry,
}: {
  session: AgentSessionState;
  projectContext: AgentProjectContext;
  onAccept: () => void;
  onDismiss: () => void;
  onReview: () => void;
  onRetry: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.identityRow}>
        <View style={styles.agentMark}>
          <Text style={styles.agentMarkText}>V</Text>
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.agentName}>AI 场记</Text>
          <Text numberOfLines={1} style={styles.agentContext}>
            {session.projectContext?.contextLabel ?? projectContext.contextLabel}
          </Text>
        </View>
        {session.phase === 'working' ? (
          <View style={styles.liveBadge}>
            <StatusDot pulse color={colors.info} />
            <Text style={styles.liveText}>正在检查</Text>
          </View>
        ) : session.phase === 'applying' ? (
          <View style={styles.liveBadge}>
            <StatusDot pulse color={colors.info} />
            <Text style={styles.liveText}>正在写入</Text>
          </View>
        ) : session.phase === 'proposed' ? (
          <StatusBadge tone={session.proposal ? 'warning' : 'info'}>
            {session.proposal ? '待确认' : session.degraded ? '降级回答' : '已回答'}
          </StatusBadge>
        ) : session.phase === 'apply-error' ? (
          <StatusBadge tone="danger">写入失败</StatusBadge>
        ) : session.phase === 'applied' ? (
          <StatusBadge tone="success">
            {session.appliedVersion ? '已写入' : '已保留'}
          </StatusBadge>
        ) : session.phase === 'error' ? (
          <StatusBadge tone="danger">执行失败</StatusBadge>
        ) : null}
      </View>

      {session.phase === 'idle' ? (
        <BodyText style={styles.intro}>
          {agentIntro(session.mode, projectContext)}
        </BodyText>
      ) : null}

      {session.phase === 'working' ? (
        <View style={styles.working}>
          <Text numberOfLines={2} style={styles.promptQuote}>“{session.submittedPrompt}”</Text>
          <View style={styles.stepRow}>
            <StatusDot pulse color={colors.info} />
            <Text style={styles.stepText}>{session.toolSteps[0]}</Text>
          </View>
          <Text style={styles.workingHint}>
            正在读取当前项目快照。本轮最多 3 次模型调用，每次按 1 单位计。
          </Text>
        </View>
      ) : null}

      {session.phase === 'stopped' ? (
        <View style={styles.stopped}>
          <Text style={styles.promptQuote}>“{session.submittedPrompt}”</Text>
          <BodyText dim>这次检查已停止。输入还留在下面，可以改一句再发送。</BodyText>
        </View>
      ) : null}

      {session.phase === 'error' ? (
        <View style={styles.stopped}>
          <Text numberOfLines={2} style={styles.promptQuote}>“{session.submittedPrompt}”</Text>
          <BodyText dim>{session.error || '这次没有拿到回答，请稍后重试。'}</BodyText>
          <SecondaryButton
            label="再试一次"
            icon="refresh-cw"
            onPress={onRetry}
            style={styles.retryButton}
          />
        </View>
      ) : null}

      {['proposed', 'applying', 'apply-error'].includes(session.phase) ? (
        <View style={styles.proposalWrap}>
          <Text numberOfLines={2} style={styles.promptQuote}>“{session.submittedPrompt}”</Text>
          {session.toolNames?.length ? (
            <View style={styles.toolTrace}>
              <Kicker>已读取</Kicker>
              <Text style={styles.toolTraceText}>
                {session.toolNames.map(toolLabel).join(' · ')}
              </Text>
              {session.modelCalls ? (
                <Text style={styles.toolCost}>{session.modelCalls} 单位</Text>
              ) : null}
            </View>
          ) : session.degraded ? (
            <View style={styles.toolTrace}>
              <Kicker>降级回答</Kicker>
              <Text style={styles.toolTraceText}>本次未执行工具</Text>
            </View>
          ) : null}
          <BodyText style={styles.response}>
            {session.reply ?? session.proposal?.summary}
          </BodyText>

          {session.proposal ? (
            <Panel elevated style={styles.proposal}>
            <View style={styles.proposalHead}>
              <View style={styles.proposalCopy}>
                <Kicker>
                  {session.phase === 'applying'
                    ? '建议 · 正在写入'
                    : session.phase === 'apply-error'
                      ? '建议 · 写入失败'
                      : '建议 · 尚未写入'}
                </Kicker>
                <Text style={styles.proposalTitle}>{session.proposal.title}</Text>
                <Text style={styles.proposalTarget}>{session.proposal.target}</Text>
              </View>
              <Feather name="corner-down-left" size={17} color={colors.textMuted} />
            </View>

            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>依据</Text>
              <Text style={styles.detailValue}>{session.proposal.evidence}</Text>
            </View>
            <View style={styles.factRow}>
              <View style={styles.fact}>
                <Text style={styles.detailLabel}>影响</Text>
                <Text style={styles.factValue}>{session.proposal.impact}</Text>
              </View>
              <View style={styles.fact}>
                <Text style={styles.detailLabel}>成本</Text>
                <Text style={styles.factValue}>{session.proposal.cost}</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <SecondaryButton
                label="返回"
                onPress={onDismiss}
                disabled={session.phase === 'applying'}
                style={styles.flexButton}
              />
              <PrimaryButton
                label={
                  session.phase === 'applying'
                    ? '写入中…'
                    : session.shotEdit && session.baseShotsSnapshotId
                      ? session.phase === 'apply-error'
                        ? '重新写入'
                        : '写入项目'
                      : '保留建议'
                }
                icon={session.phase === 'applying' ? 'loader' : 'bookmark'}
                disabled={session.phase === 'applying'}
                onPress={onAccept}
                style={styles.flexButton}
              />
            </View>
            {session.phase === 'apply-error' ? (
              <Text style={styles.applyError}>{session.error}</Text>
            ) : null}
            </Panel>
          ) : (
            <SecondaryButton
              label="继续问"
              icon="message-circle"
              onPress={onDismiss}
              style={styles.answerAction}
            />
          )}
        </View>
      ) : null}

      {session.phase === 'applied' && session.proposal ? (
        <View style={styles.appliedWrap}>
          <Text style={styles.appliedTitle}>{session.proposal.title}</Text>
          <BodyText>
            {session.appliedVersion
              ? `已写入项目，生成分镜 v${session.appliedVersion}。Web 刷新后即可看到同一版本。`
              : '建议已保留在本次对话中，尚未写入项目。查看当前镜位后再决定下一步。'}
          </BodyText>
          <View style={styles.actions}>
            <SecondaryButton
              label="继续问"
              icon="message-circle"
              onPress={onDismiss}
              style={styles.flexButton}
            />
            <PrimaryButton
              label="查看当前镜位"
              icon="arrow-up-right"
              onPress={onReview}
              style={styles.flexButton}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  agentMark: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.text,
  },
  agentMarkText: {
    color: colors.actionInk,
    fontSize: type.label,
    fontWeight: '600',
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  agentName: {
    color: colors.text,
    fontSize: type.caption,
    fontWeight: '600',
  },
  agentContext: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: type.micro,
  },
  liveBadge: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(92,117,111,0.34)',
    borderRadius: 5,
    backgroundColor: 'rgba(92,117,111,0.08)',
    paddingHorizontal: 8,
  },
  liveText: {
    color: colors.info,
    fontSize: type.micro,
    fontWeight: '600',
  },
  intro: {
    marginTop: spacing.xs,
    marginLeft: 42,
    fontSize: type.caption,
    lineHeight: 20,
  },
  working: {
    marginTop: spacing.sm,
    marginLeft: 42,
    gap: spacing.xs,
  },
  promptQuote: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '500',
    lineHeight: 22,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepText: {
    color: colors.textSecondary,
    fontSize: type.caption,
  },
  workingHint: {
    color: colors.textSecondary,
    fontSize: type.caption,
    lineHeight: 18,
  },
  toolTrace: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  toolTraceText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: type.caption,
  },
  toolCost: {
    color: colors.textSecondary,
    fontSize: type.caption,
  },
  stopped: {
    marginTop: spacing.sm,
    marginLeft: 42,
    gap: spacing.xs,
  },
  proposalWrap: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  response: {
    fontSize: type.caption,
    lineHeight: 20,
  },
  answerAction: {
    alignSelf: 'flex-start',
  },
  retryButton: {
    alignSelf: 'flex-start',
  },
  applyError: {
    color: colors.warningInk,
    fontSize: type.caption,
    lineHeight: 19,
  },
  proposal: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  proposalHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  proposalCopy: {
    flex: 1,
    minWidth: 0,
  },
  proposalTitle: {
    marginTop: 3,
    color: colors.text,
    fontSize: type.bodyLarge,
    fontWeight: '600',
    lineHeight: 23,
  },
  proposalTarget: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: type.caption,
  },
  detailBlock: {
    gap: 3,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: type.micro,
    fontWeight: '500',
  },
  detailValue: {
    color: colors.textSecondary,
    fontSize: type.caption,
    lineHeight: 19,
  },
  factRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  fact: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  factValue: {
    color: colors.textSecondary,
    fontSize: type.caption,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  flexButton: {
    flex: 1,
  },
  appliedWrap: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  appliedTitle: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
});
