// 场记的 ReAct 循环（见 AGENT.md §3、§5、§6）。
//
// 为什么循环放在前端：工具要读的是**页面当前状态**（含用户没保存的手改），
// 服务端只知道快照。循环本身是纯逻辑——模型调用与工具执行都从外面注入，
// 所以可以用假模型、假工具把「步数上限」「工具报错不打死循环」「重复调用不空转」
// 这些翻车点全部测住。
import type { AgentCard, ToolResult } from './tools'

export interface AgentToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  /** assistant 消息里模型要求的工具调用 */
  toolCalls?: AgentToolCall[]
  /** tool 消息回填时用 */
  toolCallId?: string
  toolName?: string
}

export type ModelReply = { reply?: string; toolCalls?: AgentToolCall[] }

export type LoopEvent =
  | { type: 'tool-call'; name: string; args: Record<string, unknown> }
  | { type: 'tool-result'; name: string; content: string }
  | { type: 'reply'; text: string }
  | { type: 'cap'; text: string }

export interface LoopDeps {
  /** 一次模型往返。抛错就抛给调用方——降级是接口层的决定，循环不替它做主 */
  callModel: (messages: AgentMessage[]) => Promise<ModelReply>
  executors: Record<string, (args: Record<string, unknown>) => ToolResult>
  /** 模型调用次数上限：一次调用 = 1 单位额度（见 AGENT.md §5） */
  maxModelCalls?: number
  onEvent?: (event: LoopEvent) => void
}

export interface LoopResult {
  messages: AgentMessage[]
  stoppedBy: 'reply' | 'cap'
  /** 实际发起的模型调用次数（= 消耗的额度单位数） */
  modelCalls: number
  /** propose 工具产出的待确认卡片 */
  cards: AgentCard[]
}

const DEFAULT_MAX_CALLS = 6

/**
 * 跑一轮对话。返回完整的消息轨迹，调用方只管展示。
 *
 * 三个关键行为：
 * - 工具执行抛错 → 变成 `{"error": "..."}` 回填，循环继续（工具坏了不该让对话死掉）
 * - 同一工具同一参数重复请求 → 第二次起不再执行，只告知（ReAct 最典型的空转）
 * - 到模型调用上限 → 用已查到的信息收尾，**不再多调一次模型**（额度是硬约束）
 */
export async function runAgentLoop(userText: string, deps: LoopDeps): Promise<LoopResult> {
  const maxCalls = deps.maxModelCalls ?? DEFAULT_MAX_CALLS
  const emit = deps.onEvent ?? (() => {})
  const messages: AgentMessage[] = [{ role: 'user', content: userText }]
  const cards: AgentCard[] = []
  const seen = new Set<string>()
  const findings: string[] = []
  let modelCalls = 0

  while (modelCalls < maxCalls) {
    modelCalls += 1
    const res = await deps.callModel(messages)

    if (!res.toolCalls || res.toolCalls.length === 0) {
      const text = res.reply?.trim() || '（模型没有给出内容）'
      messages.push({ role: 'assistant', content: text })
      emit({ type: 'reply', text })
      return { messages, stoppedBy: 'reply', modelCalls, cards }
    }

    messages.push({ role: 'assistant', content: res.reply ?? '', toolCalls: res.toolCalls })

    for (const call of res.toolCalls) {
      emit({ type: 'tool-call', name: call.name, args: call.args })

      const key = `${call.name}:${JSON.stringify(call.args ?? {})}`
      let content: string
      if (seen.has(key)) {
        content = '（同样的查询刚刚做过，结果见上一条，不要重复调用）'
      } else {
        seen.add(key)
        const executor = deps.executors[call.name]
        if (!executor) {
          content = JSON.stringify({ error: `没有这个工具：${call.name}` })
        } else {
          try {
            const result = executor(call.args ?? {})
            if (result.card) cards.push(result.card)
            content = result.ok ? result.content : JSON.stringify({ error: result.content })
          } catch (error) {
            // 工具内部炸了：把错误当结果回填，让模型自己决定怎么跟用户说
            content = JSON.stringify({ error: error instanceof Error ? error.message : '工具执行失败' })
          }
        }
      }

      findings.push(content)
      messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content })
      emit({ type: 'tool-result', name: call.name, content })
    }
  }

  // 到顶了：把已查到的信息收成一句话，不再花额度
  const text = `这一轮查到的情况：\n${findings.slice(-4).join('\n')}\n\n（到这一轮的工具调用上限了，想继续追问请再问一次。）`
  messages.push({ role: 'assistant', content: text })
  emit({ type: 'cap', text })
  return { messages, stoppedBy: 'cap', modelCalls, cards }
}
