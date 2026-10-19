'use client'

// AI 场记：左下角一个机器人图标，点开是对话窗口（见 AGENT.md）。
//
// 界面上要说清两件事，否则用户不敢用：
//   1. 它在干什么——每次工具调用都插一行「已读：…」，过程可见；
//   2. 它不会擅自改东西——要改什么会先给一张待确认卡片，用户点了才生效。
//
// 名字叫「场记」而不是「助手」：场记本来就是剧组里那个知道"拍到哪了、
// 哪条不行、下一场接哪"的人——它就是干这个的，不是通用聊天框。
import { useRef, useState } from 'react'
import { postJson } from '@/lib/api'
import { runAgentLoop, type AgentMessage, type LoopEvent, type ModelReply } from '@/lib/agent/loop'
import { createToolExecutors, type AgentCard, type AgentState } from '@/lib/agent/tools'
import type { StepKey } from '@/lib/types'

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
  /** 用户确认「改写某一镜」后，页面负责写回去 */
  onApplyCard: (card: Extract<AgentCard, { kind: 'shot-edit' }>) => void
  /** 用户确认「重新生成某一步」后，页面负责触发 */
  onRegenerate: (step: StepKey) => void
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
  audit_shots: '查分镜',
  get_quota: '查额度',
  search_docs: '查文档',
  propose_shot_edit: '提议改写镜头',
  propose_regenerate: '提议重跑某步',
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
    <div className="trail">
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
            {openIndex === i && step.detail && (
              <p className="trail-detail">{step.detail}</p>
            )}
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
  onApplyCard,
  onRegenerate,
}: Props) {
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const busyRef = useRef(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    })
  }

  const push = (line: Line) => {
    setLines((prev) => [...prev, line])
    scrollToEnd()
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
      push({ role: 'assistant', text: result.messages[result.messages.length - 1].content })
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
        title="AI 场记：问项目进度、怎么导出、或让它改某一镜"
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
          aria-label="AI 场记"
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
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-600 font-serif text-[13px] font-bold text-white shadow-surface">
              记
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block font-serif text-sm font-bold leading-tight text-ink-900">AI 场记</span>
              <span className="block text-xs leading-tight text-ink-400">
                {busy ? '正在查资料…' : '知道拍到哪了 · 也会替你去改，改前先问你'}
              </span>
            </span>
            {variant === 'floating' && (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="收起场记"
                className="relative shrink-0 rounded-full p-1.5 text-ink-400 transition-colors hover:bg-surface-soft hover:text-ink-700"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round]">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
          </header>

          {variant === 'docked' && context && (
            <div className="deck-ctx">正在看 <b>{context}</b></div>
          )}

          <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {lines.length === 0 && (
              <div className="space-y-2.5">
                <p className="text-xs text-ink-500">它会先查一眼项目，再回答你：</p>
                {[
                  { q: '现在还有哪些要处理？', hint: '读进度与镜头健康度' },
                  { q: '怎么把产物拿到出图平台生成视频？', hint: '查文档，回答带出处' },
                  { q: '帮我把第 1 镜的雨再改大一点', hint: '给一张待确认卡片，你点了才改' },
                ].map((item) => (
                  <button
                    key={item.q}
                    type="button"
                    onClick={() => setInput(item.q)}
                    className="block w-full rounded-card border border-surface-line bg-surface-card px-3 py-2.5 text-left
                      transition-all duration-150 hover:-translate-y-[1px] hover:border-accent-300 hover:bg-accent-50/50"
                  >
                    <span className="block text-xs text-ink-800">{item.q}</span>
                    <span className="mt-0.5 block text-xs text-ink-400">{item.hint}</span>
                  </button>
                ))}
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
                    <span className="who gold">场记</span>
                    {/* 分段渲染：模型爱用空行分段，整块 pre-wrap 出来会挤成一坨 */}
                    <div className="msg-body">
                      {line.text.split(/\n{2,}/).map((para, j) => (
                        <p key={j}>
                          {para.split('\n').map((row, k) => (
                            <span key={k} className="block">
                              {row}
                            </span>
                          ))}
                        </p>
                      ))}
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
                  <p key={i} className="msg-note">
                    {line.text}
                  </p>
                )
              }
              // 待确认卡片：用户点了才真正改
              return (
                <div key={i} className="prop">
                  <p className="prop-h">
                    {line.card.kind === 'shot-edit' ? `待确认：第 ${line.card.shot} 镜 · ${line.card.summary}` : `待确认：重新生成「${line.card.stepLabel}」`}
                  </p>
                  <p className="prop-b">
                    {line.card.kind === 'shot-edit' ? line.card.text : line.card.reason}
                  </p>
                  <div className="prop-a">
                    <button
                      type="button"
                      onClick={() => {
                        if (line.card.kind === 'shot-edit') onApplyCard(line.card)
                        else onRegenerate(line.card.step)
                        push({ role: 'note', text: '已按你的确认执行。' })
                      }}
                      className="ok"
                    >
                      确认
                    </button>
                    <button
                      type="button"
                      onClick={() => push({ role: 'note', text: '已忽略这条建议。' })}
                      className="no"
                    >
                      忽略
                    </button>
                  </div>
                </div>
              )
            })}
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问进度、怎么导出，或让我改某一镜…"
              aria-label="向 AI 场记提问"
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
