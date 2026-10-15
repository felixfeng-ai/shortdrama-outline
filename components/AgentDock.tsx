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
  /** 用户确认「改写某一镜」后，页面负责写回去 */
  onApplyCard: (card: Extract<AgentCard, { kind: 'shot-edit' }>) => void
  /** 用户确认「重新生成某一步」后，页面负责触发 */
  onRegenerate: (step: StepKey) => void
}

/** 对话里的一行：用户 / 助手 / 工具调用 / 待确认卡片 */
type Line =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string }
  | { role: 'tool'; text: string }
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

export default function AgentDock({ state, open, onOpenChange, onApplyCard, onRegenerate }: Props) {
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
            push({ role: 'tool', text: `已读：${TOOL_LABEL[event.name] ?? event.name}` })
          } else if (event.type === 'tool-result') {
            push({ role: 'note', text: event.content.slice(0, 160) })
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
    }
  }

  return (
    <>
      {/* 左下角图标 */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        title="AI 场记：问项目进度、怎么导出、或让它改某一镜"
        className="group fixed bottom-6 left-6 z-40 flex h-12 w-12 items-center justify-center rounded-full
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

      {open && (
        <section
          aria-label="AI 场记"
          className="panel-in fixed bottom-20 left-6 z-40 flex h-[580px] w-[430px] max-w-[calc(100vw-3rem)] flex-col
            overflow-hidden rounded-panel border border-surface-line bg-surface-card shadow-lift"
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
              <span className="block text-[10.5px] leading-tight text-ink-400">
                {busy ? '正在查资料…' : '知道拍到哪了 · 也会替你去改，改前先问你'}
              </span>
            </span>
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
          </header>

          <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
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
                    <span className="mt-0.5 block text-[10.5px] text-ink-400">{item.hint}</span>
                  </button>
                ))}
              </div>
            )}

            {lines.map((line, i) => {
              if (line.role === 'user') {
                return (
                  <p key={i} className="ml-10 rounded-card rounded-br-chip bg-accent-100/80 px-3.5 py-2.5 text-xs leading-relaxed text-ink-800">
                    {line.text}
                  </p>
                )
              }
              if (line.role === 'assistant') {
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-50 font-serif text-[11px] font-bold text-accent-700"
                    >
                      记
                    </span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap rounded-card rounded-bl-chip bg-surface-soft px-3.5 py-2.5 text-xs leading-relaxed text-ink-800">
                      {line.text}
                    </p>
                  </div>
                )
              }
              if (line.role === 'tool') {
                return (
                  <p key={i} className="ml-3 flex items-center gap-2 border-l border-accent-200 pl-3 text-[10.5px] text-accent-700">
                    <span aria-hidden="true" className="-ml-[17px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                    {line.text}
                  </p>
                )
              }
              if (line.role === 'note') {
                return (
                  <p key={i} className="ml-3 border-l border-surface-line pl-3 text-[10.5px] leading-relaxed text-ink-400">
                    {line.text}
                  </p>
                )
              }
              // 待确认卡片：用户点了才真正改
              return (
                <div key={i} className="rounded-card border border-accent-200 bg-accent-50/60 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-accent-800">
                    {line.card.kind === 'shot-edit' ? `待确认：第 ${line.card.shot} 镜 · ${line.card.summary}` : `待确认：重新生成「${line.card.stepLabel}」`}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-700">
                    {line.card.kind === 'shot-edit' ? line.card.text : line.card.reason}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (line.card.kind === 'shot-edit') onApplyCard(line.card)
                        else onRegenerate(line.card.step)
                        push({ role: 'note', text: '已按你的确认执行。' })
                      }}
                      className="rounded-pill bg-accent-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-accent-700"
                    >
                      确认
                    </button>
                    <button
                      type="button"
                      onClick={() => push({ role: 'note', text: '已忽略这条建议。' })}
                      className="rounded-pill border border-surface-line px-3 py-1.5 text-[11px] text-ink-600"
                    >
                      忽略
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {degraded && (
            <p className="border-t border-surface-line px-4 py-2 text-[10.5px] text-ink-400">
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
          <p className="px-4 pb-3 text-[10px] text-ink-400">
            一次完整流程 13 单位；这里的每次提问按模型往返计费，单轮最多 6 次查询。
          </p>
        </section>
      )}
    </>
  )
}
