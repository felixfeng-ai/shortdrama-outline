'use client'

// Veya Agent：左下角一个机器人图标，点开是对话窗口（见 AGENT.md）。
//
// 界面上要说清两件事，否则用户不敢用：
//   1. 它在干什么——每次工具调用都插一行「已读：…」，过程可见；
//   2. 它不会擅自改东西——要改什么会先给一张待确认卡片，用户点了才生效。
//
// 名字叫「场记」而不是「助手」：场记本来就是剧组里那个知道"拍到哪了、
// 哪条不行、下一场接哪"的人——它就是干这个的，不是通用聊天框。
import { useEffect, useRef, useState } from 'react'
import { postJson } from '@/lib/api'
import {
  appendProjectThreadMessage,
  createProjectThread,
  fetchProjectThread,
  listProjectThreads,
} from '@/lib/assets/api'
import { runAgentLoop, type AgentMessage, type LoopEvent, type ModelReply } from '@/lib/agent/loop'
import { createToolExecutors, type AgentCard, type AgentState } from '@/lib/agent/tools'
import { inspectEditTarget, type EditTargetStatus } from '@/lib/agent/edits'
import { buildAgentActionPlan } from '@/lib/agent/plan'
import { listAgentRuns } from '@/lib/agent/runs-client'
import type { AgentActionRunDto } from '@/lib/agent/runs'
import { STEPS, type StepKey } from '@/lib/types'
import SmoothCollapse from './SmoothCollapse'
import StreamingText from './StreamingText'
import AgentRichText from './AgentRichText'
import AgentRunPanel from './AgentRunPanel'

type MaybePromise<T> = T | Promise<T>

interface Props {
  /** 页面当前状态的快照（工具只读它） */
  state: AgentState
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * floating：原来的左下角浮标 + 浮层；
   * docked：直接长在 H 的产出舱里（没有浮标，也不再自己定位）。
   */
  variant?: 'floating' | 'docked'
  /** 舱里显示「正在看什么」：当前镜头或当前步骤 */
  context?: string
  /** 一轮回答结束（含失败说明）时通知外层，用来点亮未读角标 */
  onNewMessage?: () => void
  /** 把当前会话中的待确认卡同步到项目级产物中心 */
  onPendingCardsChange?: (cards: AgentCard[]) => void
  /** 用户确认「改写某一镜」后，页面负责写回去 */
  onApplyCard: (card: Extract<AgentCard, { kind: 'shot-edit' }>) => MaybePromise<{
    ok: boolean
    message: string
  }>
  /** 用户确认实体级建议后，页面按稳定实体 id 写回对应字段 */
  onApplyEntityCard: (card: Extract<AgentCard, { kind: 'entity-edit' }>) => Promise<{
    ok: boolean
    message: string
  }>
  /** 海外工作区确认本地化修改 */
  onApplyLocalization?: (card: Extract<AgentCard, { kind: 'localization-edit' }>) => void
  /** 用户确认「结构化决策」后，页面负责落库 */
  onApplyDecision: (card: Extract<AgentCard, { kind: 'decision' }>) => void
  /** 用户确认「重新生成某一步」后，页面负责触发 */
  onRegenerate: (step: StepKey) => void
  onOpenStep?: (step: StepKey) => void
  /** 多会话必须挂在项目下；未保存项目时仍允许本地单会话。 */
  projectId?: string | null
  /** 从画布等入口带入的问题；只预填，不自动发送 */
  seedPrompt?: { id: number; text: string } | null
  /** 页面负责恢复快照与同步工作台内存状态 */
  onRollbackAgentRun?: (runId: string) => Promise<{ ok: boolean; message: string }>
}

/** 一轮里的一个"过程步骤"（查了什么、拿到什么） */
interface ProcessStep {
  label: string
  /** 原始返回；默认折叠，想看细节才展开 */
  detail: string
}

/**
 * 对话里的一块内容。过程（查了什么）与回答分开建模：
 * 把工具原始返回直接糊在对话里，用户读到的是 `✗ ✓` 这种机器串——
 * 那是排障信息，不该是默认视图。
 */
type Line =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string }
  | { role: 'process'; steps: ProcessStep[] }
  | { role: 'note'; text: string }
  | { role: 'card'; card: AgentCard }

const TOOL_LABEL: Record<string, string> = {
  get_project_status: '读项目状态',
  list_edit_targets: '读可修改目标',
  audit_shots: '查分镜',
  review_episodes: '审分集',
  get_quota: '查额度',
  get_decisions: '读创作决策',
  get_entity_comments: '读实体批注',
  list_localization_branches: '读海外分支',
  get_localization_context: '读本地化上下文',
  search_docs: '查文档',
  propose_shot_edit: '提议改写镜头',
  propose_entity_edit: '提议修改实体',
  propose_localization_edit: '提议本地化修改',
  propose_regenerate: '提议重跑某步',
  propose_decision: '提议创作决策',
  propose_video_plan: '计算视频预算',
  audit_video_quality: '查视频质检',
  propose_video_rework: '生成视频返修卡',
  propose_timeline_update: '生成时间线提案',
  propose_voice_bindings: '生成音色建议',
  propose_tts_batch: '计算 TTS 批量预算',
  propose_episode_render: '生成成片提案',
}

function inspectCardTarget(card: AgentCard, state: AgentState): EditTargetStatus {
  if (card.kind === 'shot-edit') {
    const shot = state.shots.find((item) => item.targetId === card.targetId)
    if (!shot) return 'missing'
    return inspectEditTarget(shot[card.target], card.expectedText)
  }
  if (card.kind === 'entity-edit') {
    const entity = state.entities?.find((item) =>
      item.type === card.targetType && item.id === card.targetId
    )
    if (!entity) return 'missing'
    return inspectEditTarget(entity.fields?.[card.field], card.expectedText)
  }
  return 'current'
}

function cardHeading(card: AgentCard): string {
  if (card.kind === 'shot-edit') return `待确认：${card.targetLabel} · ${card.summary}`
  if (card.kind === 'entity-edit') return `待确认：${card.targetName} · ${card.summary}`
  if (card.kind === 'localization-edit') return `待确认本地化：${card.targetName} · ${card.summary}`
  if (card.kind === 'decision') return `待确认决策：${card.stepLabel} · ${card.question}`
  if (card.kind === 'video-plan') return `视频预算：${card.shotCount} 镜 · ${card.model}`
  if (card.kind === 'video-rework') return `视频返修：${card.items.length} 镜`
  if (card.kind === 'timeline-plan') return `时间线提案：第 ${card.episode} 集 · ${card.operations.length} 项`
  if (card.kind === 'voice-plan') return `音色建议：${card.bindings.length} 个角色`
  if (card.kind === 'tts-plan') return `TTS 批量：${card.lineCount} 句`
  if (card.kind === 'render-plan') return `成片提案：第 ${card.episode} 集`
  return `待确认：重新生成「${card.stepLabel}」`
}

function cardBody(card: AgentCard): string {
  if (card.kind === 'shot-edit' || card.kind === 'entity-edit' || card.kind === 'localization-edit') {
    return card.text
  }
  if (card.kind === 'decision') return `推荐「${card.recommended}」：${card.reason}`
  if (card.kind === 'video-plan') {
    return `${card.durationSeconds} 秒/镜 · ${card.resolution} · 预计 ¥${(card.estimatedCostMicros / 1_000_000).toFixed(2)} · 上限 ¥${(card.budgetLimitMicros / 1_000_000).toFixed(2)}`
  }
  if (card.kind === 'video-rework') return card.summary
  if (card.kind === 'timeline-plan') return card.summary
  if (card.kind === 'voice-plan') return card.summary
  if (card.kind === 'tts-plan') {
    return `${card.summary} · 预计 ¥${(card.estimatedCostMicros / 1_000_000).toFixed(2)} · 上限 ¥${(card.maxBudgetMicros / 1_000_000).toFixed(2)}`
  }
  if (card.kind === 'render-plan') return card.summary
  return card.reason
}

function cardPrimaryLabel(card: AgentCard): string {
  if (card.kind === 'video-plan') return '知道了'
  if (
    card.kind === 'video-rework'
    || card.kind === 'timeline-plan'
    || card.kind === 'voice-plan'
    || card.kind === 'tts-plan'
    || card.kind === 'render-plan'
  ) return '去处理'
  return '确认'
}

/**
 * 过程时间轴：一行一个"查了什么"，原始返回默认折叠。
 *
 * 为什么默认折叠：工具返回是给自己看的排障信息（`人物✗ 三幕✗ …`），
 * 用户要的是结论。想核对的时候点开就行——这也让"它到底查了没"可被验证。
 */
function ProcessTrail({ steps }: { steps: ProcessStep[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    // 工具轨迹走等宽缩进（├ └），不用左侧竖线——竖线是装饰，缩进才是结构
    <div className="trail agent-line-in">
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        return (
          <div key={`${step.label}-${i}`}>
            <button
              type="button"
              onClick={() => step.detail && setOpenIndex(openIndex === i ? null : i)}
              disabled={!step.detail}
              className="trail-row"
            >
              <span aria-hidden="true" className="trail-mark">{last ? '└' : '├'}</span>
              <span className="trail-label">{step.label}</span>
              {step.detail && <span className="trail-more">{openIndex === i ? '−' : '+'}</span>}
            </button>
            <SmoothCollapse open={openIndex === i && Boolean(step.detail)}>
              <p className="trail-detail">{step.detail}</p>
            </SmoothCollapse>
          </div>
        )
      })}
    </div>
  )
}

export default function AgentDock({
  state,
  open,
  onOpenChange,
  variant = 'floating',
  context,
  onNewMessage,
  onPendingCardsChange,
  onApplyCard,
  onApplyEntityCard,
  onApplyLocalization,
  onApplyDecision,
  onRegenerate,
  onOpenStep,
  seedPrompt,
  projectId,
  onRollbackAgentRun,
}: Props) {
  const [lines, setLines] = useState<Line[]>([])
  const [threads, setThreads] = useState<Array<{ id: string; title: string; messageCount: number }>>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [threadBusy, setThreadBusy] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [runs, setRuns] = useState<AgentActionRunDto[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)
  const busyRef = useRef(false)
  const projectRef = useRef(projectId)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  projectRef.current = projectId
  const missingSteps = STEPS.filter((step) => !state.completed[step.key])
  const missingSummary = missingSteps.length > 0
    ? `还有 ${missingSteps.length} 个步骤未完成：${missingSteps.slice(0, 2).map((step) => step.short).join('、')}。我可以直接带你过去。`
    : '六步产物已经齐了。我可以继续帮你审分镜、查返修或整理导出清单。'

  useEffect(() => {
    const cards = lines.flatMap((line) => line.role === 'card' ? [line.card] : [])
    onPendingCardsChange?.(cards)
  }, [lines, onPendingCardsChange])

  useEffect(() => {
    if (!projectId) {
      setRuns([])
      setRunsError(null)
      return
    }
    setRuns([])
    setRunsError(null)
    void refreshRuns()
    // 项目切换时重新读取；refreshRuns 只依赖当前 projectId。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function refreshRuns() {
    if (!projectId) return
    const requestedProjectId = projectId
    setRunsLoading(true)
    setRunsError(null)
    try {
      const nextRuns = await listAgentRuns(requestedProjectId)
      if (projectRef.current === requestedProjectId) setRuns(nextRuns)
    } catch (error) {
      if (projectRef.current === requestedProjectId) {
        setRunsError(error instanceof Error ? error.message : '执行记录读取失败')
      }
    } finally {
      if (projectRef.current === requestedProjectId) setRunsLoading(false)
    }
  }

  async function rollbackRun(runId: string) {
    if (!onRollbackAgentRun || rollingBackId) return
    setRollingBackId(runId)
    setRunsError(null)
    try {
      const result = await onRollbackAgentRun(runId)
      push({ role: 'note', text: result.message })
      if (result.ok) await refreshRuns()
      else setRunsError(result.message)
    } catch (error) {
      setRunsError(error instanceof Error ? error.message : '回滚失败，请重试')
    } finally {
      setRollingBackId(null)
    }
  }

  async function loadThread(threadId: string) {
    if (!projectId) return
    setThreadBusy(true)
    try {
      const thread = await fetchProjectThread(projectId, threadId)
      setActiveThreadId(thread.id)
      setLines((thread.messages ?? [])
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          text: message.content,
        })))
    } catch (error) {
      push({ role: 'note', text: error instanceof Error ? error.message : '会话读取失败' })
    } finally {
      setThreadBusy(false)
    }
  }

  useEffect(() => {
    if (!projectId) {
      setThreads([])
      setActiveThreadId(null)
      setLines([])
      return
    }
    setLines([])
    setActiveThreadId(null)
    let active = true
    listProjectThreads(projectId)
      .then((items) => {
        if (!active) return
        setThreads(items)
        if (items[0]) void loadThread(items[0].id)
      })
      .catch(() => {
        if (active) setThreads([])
      })
    return () => {
      active = false
    }
    // loadThread 依赖同一个 projectId；这里只响应项目切换。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function newThread() {
    if (!projectId || threadBusy) return
    setThreadBusy(true)
    try {
      const thread = await createProjectThread(projectId)
      setThreads((current) => [{ ...thread, messageCount: 0 }, ...current])
      setActiveThreadId(thread.id)
      setLines([])
      setDegraded(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    } catch (error) {
      push({ role: 'note', text: error instanceof Error ? error.message : '新建会话失败' })
    } finally {
      setThreadBusy(false)
    }
  }

  useEffect(() => {
    if (!seedPrompt) return
    setInput(seedPrompt.text)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [seedPrompt])

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    })
  }

  const push = (line: Line) => {
    setLines((prev) => [...prev, line])
    scrollToEnd()
  }

  const removeCard = (card: AgentCard) => {
    setLines((current) => current.filter((item) =>
      item.role !== 'card' || item.card !== card
    ))
  }

  /** 追加一个过程步骤（同一轮里连续的过程合并成一个块） */
  const pushStep = (step: ProcessStep) => {
    setLines((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === 'process') {
        return [...prev.slice(0, -1), { role: 'process', steps: [...last.steps, step] }]
      }
      return [...prev, { role: 'process', steps: [step] }]
    })
    scrollToEnd()
  }

  /** 把最新一步的原始返回补上（默认折叠） */
  const fillStepDetail = (name: string, detail: string) => {
    setLines((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'process') return prev
      const steps = last.steps.map((s, i) =>
        i === last.steps.length - 1 && !s.detail ? { ...s, detail } : s,
      )
      void name
      return [...prev.slice(0, -1), { role: 'process', steps }]
    })
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setInput('')
    push({ role: 'user', text })
    let threadId = activeThreadId
    if (projectId) {
      try {
        if (!threadId) {
          const thread = await createProjectThread(projectId, text.slice(0, 24))
          threadId = thread.id
          setThreads((current) => [{ ...thread, messageCount: 0 }, ...current])
          setActiveThreadId(thread.id)
        }
        await appendProjectThreadMessage(projectId, threadId, { role: 'user', content: text })
        setThreads((current) => current.map((thread) =>
          thread.id === threadId
            ? { ...thread, messageCount: thread.messageCount + 1 }
            : thread
        ))
      } catch {
        // 会话持久化失败不能阻止本轮问答；界面上仍保留本地消息。
      }
    }

    // 把显示用的对话压成协议消息；工具消息按 AGENT.md 的约定回填
    const toMessages = (): AgentMessage[] =>
      lines
        .filter((l): l is Extract<Line, { role: 'user' | 'assistant' }> => l.role === 'user' || l.role === 'assistant')
        .map((l) => ({ role: l.role, content: l.text }))

    const callModel = async (messages: AgentMessage[]): Promise<ModelReply> => {
      const data = await postJson<{ reply?: string; toolCalls?: ModelReply['toolCalls']; degraded?: boolean }>(
        '/api/agent',
        { messages },
      )
      if (data.degraded) setDegraded(true)
      return { reply: data.reply, toolCalls: data.toolCalls }
    }

    const executors = createToolExecutors(state)

    try {
      const history = toMessages()
      const result = await runAgentLoop(text, {
        callModel: async (messages) => {
          // runAgentLoop 维护的是「本轮」的消息；历史在前，这里拼起来
          return callModel([...history, ...messages])
        },
        executors,
        onEvent: (event: LoopEvent) => {
          if (event.type === 'tool-call') {
            pushStep({ label: `已读 ${TOOL_LABEL[event.name] ?? event.name}`, detail: '' })
          } else if (event.type === 'tool-result') {
            fillStepDetail(event.name, event.content.slice(0, 600))
          }
        },
      })
      const answer = result.messages[result.messages.length - 1].content
      push({ role: 'assistant', text: answer })
      if (projectId && threadId) {
        void appendProjectThreadMessage(projectId, threadId, {
          role: 'assistant',
          content: answer,
        }).then(() => {
          setThreads((current) => current.map((thread) =>
            thread.id === threadId
              ? { ...thread, messageCount: thread.messageCount + 1 }
              : thread
          ))
        }).catch(() => {})
      }
      for (const card of result.cards) push({ role: 'card', card })
    } catch (error) {
      push({ role: 'note', text: error instanceof Error ? error.message : '这次没能回答，稍后再试' })
    } finally {
      setBusy(false)
      busyRef.current = false
      scrollToEnd()
      onNewMessage?.()
    }
  }

  return (
    <>
      {/* 左下角图标 */}
      {variant === 'floating' && (
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        title="Veya Agent：问项目进度、怎么导出、或让它改某一镜"
        className="agent-fab group fixed bottom-6 left-6 z-40 flex h-12 w-12 items-center justify-center rounded-full
          border border-accent-300 bg-surface-card text-accent-700 shadow-surface
          transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-50 hover:shadow-lift"
      >
        {/* 静息时的呼吸光圈：让"它在待命"这件事看得见，又不过分抢眼 */}
        {!open && !busy && (
          <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-accent-300/25 [animation-duration:2.6s]" />
        )}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="relative h-6 w-6 fill-none stroke-current [stroke-width:1.6] [stroke-linecap:round] [stroke-linejoin:round]">
          <rect x="4" y="8" width="16" height="11" rx="3" />
          <path d="M12 8V4.5M9.5 4.5h5" />
          <circle cx="9.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
          <path d="M10 16.5h4" />
        </svg>
        {busy && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-accent-500" />
        )}
      </button>
      )}

      {(variant === 'docked' || open) && (
        <section
          aria-label="Veya Agent"
          className={variant === 'docked'
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'panel-in fixed bottom-20 left-6 z-40 flex h-[600px] w-[440px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-panel border border-surface-line bg-surface-card shadow-lift'}
        >
          {/* 头部：一条极淡的朱砂渐晕 + 场记身份 + 状态 */}
          <header className="relative flex items-center gap-2.5 border-b border-surface-line px-4 py-3">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-full
                bg-gradient-to-r from-accent-50 via-accent-50/40 to-transparent"
            />
            <span className="agent-brand-mark relative h-8 w-8 shrink-0 text-[13px] font-bold">
              V
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="agent-brand-name">Veya Agent</span>
              <span className="block text-xs leading-tight text-ink-400">
                {busy ? '正在查资料…' : '剧作与制作 Agent · 会查会改，改前先确认'}
              </span>
            </span>
            {variant === 'floating' && (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="收起 Veya Agent"
                className="relative shrink-0 rounded-full p-1.5 text-ink-400 transition-colors hover:bg-surface-soft hover:text-ink-700"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round]">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
          </header>

          {projectId && (
            <div className="agent-session-bar">
              <span className="agent-session-label" aria-hidden="true">会话</span>
              <span className="agent-session-select-wrap">
                <select
                  aria-label="切换 Veya Agent 会话"
                  value={activeThreadId ?? ''}
                  disabled={threadBusy}
                  onChange={(event) => {
                    if (event.target.value) void loadThread(event.target.value)
                  }}
                  className="agent-session-select"
                >
                  {!activeThreadId && <option value="">新会话</option>}
                  {threads.map((thread) => (
                    <option key={thread.id} value={thread.id}>
                      {thread.title} · {thread.messageCount}
                    </option>
                  ))}
                </select>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4 6 4 4 4-4" />
                </svg>
              </span>
              <button
                type="button"
                disabled={threadBusy}
                onClick={() => void newThread()}
                className="agent-session-new"
                aria-label="新建 Veya Agent 会话"
              >
                <span aria-hidden="true">+</span>
                {threadBusy ? '处理中…' : '新会话'}
              </button>
            </div>
          )}

          {projectId && onRollbackAgentRun && (
            <AgentRunPanel
              runs={runs}
              loading={runsLoading}
              error={runsError}
              rollingBackId={rollingBackId}
              onRefresh={() => { void refreshRuns() }}
              onRollback={rollbackRun}
            />
          )}

          {variant === 'docked' && context && (
            <div className="deck-ctx">正在看 <b>{context}</b></div>
          )}

          <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {lines.length === 0 && (
              <div className="agent-welcome">
                <button
                  type="button"
                  className="agent-prompt-bubble"
                  onClick={() => setInput('现在还有哪些要处理？')}
                >
                  现在还有哪些要处理？
                </button>
                <div className="agent-answer-bubble">
                  <span>Veya Agent</span>
                  <p>{missingSummary}</p>
                </div>
                <div className="agent-starter-list agent-starter-secondary">
                  <div className="agent-starter-head">
                    <span>更多快捷指令</span>
                    <span>先查项目，再回答</span>
                  </div>
                  {[
                  { q: '现在还有哪些要处理？', hint: '读进度与镜头健康度' },
                  { q: '怎么把产物拿到出图平台生成视频？', hint: '查文档，回答带出处' },
                  { q: '帮我把第 1 镜的雨再改大一点', hint: '给一张待确认卡片，你点了才改' },
                  ].slice(1).map((item) => (
                    <button
                      key={item.q}
                      type="button"
                      onClick={() => setInput(item.q)}
                      className="agent-starter"
                    >
                      <span className="agent-starter-copy">
                        <span className="agent-starter-q">{item.q}</span>
                        <span className="agent-starter-hint">{item.hint}</span>
                      </span>
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M7 4.5 12.5 10 7 15.5" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lines.map((line, i) => {
              if (line.role === 'user') {
                return (
                  <div key={i} className="msg">
                    <span className="who">你</span>
                    <p>{line.text}</p>
                  </div>
                )
              }
              if (line.role === 'assistant') {
                return (
                  <div key={i} className="msg">
                    <span className="who gold">Veya Agent</span>
                    <div className="msg-body agent-stream-body">
                      <StreamingText
                        text={line.text}
                        onProgress={scrollToEnd}
                        render={(visibleText) => <AgentRichText text={visibleText} onOpenStep={onOpenStep} />}
                      />
                    </div>
                  </div>
                )
              }
              if (line.role === 'process') {
                return <ProcessTrail key={i} steps={line.steps} />
              }
              if (line.role === 'note') {
                return (
                  // 引用说明用缩进表达从属，不用左侧竖线（P-38 禁止卡片/列表项左侧竖线装饰）
                  <p key={i} className="msg-note agent-line-in">
                    {line.text}
                  </p>
                )
              }
              // 待确认卡片：用户点了才真正改
              const editStatus = inspectCardTarget(line.card, state)
              const actionPlan = buildAgentActionPlan(line.card)
              const planBlocked = Boolean(actionPlan && !projectId)
              const editBlocked = planBlocked || (line.card.kind === 'video-plan'
                ? false
                : editStatus !== 'current')
              return (
                <div key={i} className="prop agent-line-in">
                  <p className="prop-h">
                    {cardHeading(line.card)}
                  </p>
                  {actionPlan ? (
                    <div className="agent-plan-brief">
                      <div className="agent-plan-brief-head">
                        <span>执行计划</span>
                        <em>{projectId ? '可回滚' : '需保存项目'}</em>
                      </div>
                      <p>
                        <b>目标</b>
                        {actionPlan.targetLabel}
                        <i>{actionPlan.fieldLabel}</i>
                      </p>
                      <dl>
                        <div>
                          <dt>原值</dt>
                          <dd>{actionPlan.before || '空'}</dd>
                        </div>
                        <div>
                          <dt>目标值</dt>
                          <dd>{actionPlan.after}</dd>
                        </div>
                      </dl>
                      <ul>
                        {actionPlan.impact.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <p className="prop-b">
                      {cardBody(line.card)}
                    </p>
                  )}
                  {line.card.kind === 'decision' && (
                    <p className="prop-b">
                      候选：{line.card.options.join(' / ')}
                    </p>
                  )}
                  {(line.card.kind === 'shot-edit' || line.card.kind === 'entity-edit')
                    && editBlocked
                    && !planBlocked && (
                    <p className="text-[11px] leading-relaxed text-ink-400" role="status">
                      {editStatus === 'drift'
                        ? '目标已改动。这条建议基于旧内容，不会覆盖当前文本；请让 Agent 重新读取。'
                        : '目标已不存在。请让 Agent 重新读取项目后再提议。'}
                    </p>
                  )}
                  <div className="prop-a">
                    <button
                      type="button"
                      disabled={editBlocked}
                      onClick={() => {
                        void (async () => {
                          if (line.card.kind === 'shot-edit') {
                            const result = await onApplyCard(line.card)
                            if (result.ok) removeCard(line.card)
                            push({ role: 'note', text: result.message })
                            if (result.ok && projectId) await refreshRuns()
                          } else if (line.card.kind === 'entity-edit') {
                            const result = await onApplyEntityCard(line.card)
                            if (result.ok) removeCard(line.card)
                            push({ role: 'note', text: result.message })
                            if (result.ok && projectId) await refreshRuns()
                          } else if (line.card.kind === 'localization-edit') {
                            if (onApplyLocalization) {
                              onApplyLocalization(line.card)
                              removeCard(line.card)
                            }
                            else push({ role: 'note', text: '请在海外本地化工作区确认这条修改。' })
                          } else if (line.card.kind === 'decision') {
                            onApplyDecision(line.card)
                            removeCard(line.card)
                            push({ role: 'note', text: '已提交这条创作决策。' })
                          } else if (line.card.kind === 'video-plan') {
                            removeCard(line.card)
                            push({ role: 'note', text: '视频预算已记录，尚未创建付费任务。' })
                          } else if (
                            line.card.kind === 'video-rework'
                            || line.card.kind === 'timeline-plan'
                            || line.card.kind === 'voice-plan'
                            || line.card.kind === 'tts-plan'
                            || line.card.kind === 'render-plan'
                          ) {
                            onOpenStep?.('shots')
                            push({ role: 'note', text: '提案已记录，尚未自动执行。' })
                          } else {
                            onRegenerate(line.card.step)
                            removeCard(line.card)
                            push({ role: 'note', text: '已按你的确认重跑该步骤。' })
                          }
                        })()
                      }}
                      className="ok disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {planBlocked
                        ? '需保存项目'
                        : editBlocked
                          ? '需重新读取'
                          : actionPlan ? '执行计划' : cardPrimaryLabel(line.card)}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeCard(line.card)
                        push({ role: 'note', text: '已忽略这条建议。' })
                      }}
                      className="no"
                    >
                      {actionPlan ? '取消计划' : '忽略'}
                    </button>
                  </div>
                </div>
              )
            })}
            {busy && (
              <div className="agent-thinking" role="status" aria-live="polite">
                <span>Veya Agent 正在核对项目</span>
                <span className="agent-thinking-dots" aria-hidden="true">
                  <i /><i /><i />
                </span>
              </div>
            )}
          </div>

          {degraded && (
            <p className="border-t border-surface-line px-4 py-2 text-xs text-ink-400">
              本次模型不支持工具调用，只能用对话上下文回答。
            </p>
          )}

          <form
            className="flex items-center gap-2 border-t border-surface-line px-3 py-3"
            onSubmit={(e) => { e.preventDefault(); void send() }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问进度、怎么导出，或让我改某一镜…"
              aria-label="向 Veya Agent 提问"
              className="min-w-0 flex-1 rounded-pill border border-surface-line bg-surface-soft px-4 py-2.5 text-xs
                text-ink-800 placeholder:text-ink-400 focus:border-accent-300 focus:bg-surface-card focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || input.trim().length === 0}
              aria-label="发送"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                bg-gradient-to-b from-accent-500 to-accent-700 text-white
                transition-all duration-150 hover:brightness-105 disabled:opacity-45"
            >
              {busy ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 animate-spin">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" opacity="0.35" />
                  <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]">
                  <path d="M12 19.5V5" />
                  <path d="M5.6 11.2L12 4.8l6.4 6.4" />
                </svg>
              )}
            </button>
          </form>
          <p className="px-4 pb-3 text-[11px] text-ink-400">
            一次完整流程 13 单位；这里的每次提问按模型往返计费，单轮最多 6 次查询。
          </p>
        </section>
      )}
    </>
  )
}
