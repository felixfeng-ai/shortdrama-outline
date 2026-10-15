// 把前端的对话消息翻译成上游（OpenAI 兼容）能吃的形状。
//
// 单独抽出来是因为这里踩过一次坑：重建消息时丢掉了 assistant 的 `tool_calls`，
// 于是紧随其后的 `tool` 消息找不到对应的调用 id，上游直接 400——
// 而界面上只显示「AI 调用失败」，根本看不出是少了一个字段。
// 现在它是纯函数，有测试盯着。
import type { ToolChatMessage } from '../deepseek'

/** 客户端发来的消息：字段比线上协议更宽松（toolCalls 是解析好的对象） */
export interface WireIncoming {
  role?: unknown
  content?: unknown
  toolCallId?: unknown
  toolCalls?: unknown
}

export const MAX_WIRE_MESSAGES = 24
export const MAX_WIRE_CONTENT = 2000

export function toWireMessages(value: unknown): ToolChatMessage[] {
  if (!Array.isArray(value)) return []
  const out: ToolChatMessage[] = []

  for (const raw of value.slice(-MAX_WIRE_MESSAGES)) {
    const m = (raw ?? {}) as WireIncoming
    const role = m.role === 'assistant' || m.role === 'tool' ? m.role : 'user'
    const content = typeof m.content === 'string' ? m.content.slice(0, MAX_WIRE_CONTENT) : ''

    if (role === 'tool') {
      out.push({ role: 'tool', content, tool_call_id: typeof m.toolCallId === 'string' ? m.toolCallId : 'call' })
      continue
    }

    if (role === 'assistant' && Array.isArray(m.toolCalls)) {
      const tool_calls = m.toolCalls
        .map((c) => {
          const call = (c ?? {}) as { id?: unknown; name?: unknown; args?: unknown }
          const name = typeof call.name === 'string' ? call.name : ''
          if (!name) return null
          return {
            id: typeof call.id === 'string' ? call.id : name,
            type: 'function' as const,
            function: { name, arguments: JSON.stringify(call.args ?? {}) },
          }
        })
        .filter((c): c is { id: string; type: 'function'; function: { name: string; arguments: string } } => !!c)
      out.push({ role: 'assistant', content, ...(tool_calls.length > 0 ? { tool_calls } : {}) })
      continue
    }

    out.push({ role, content })
  }

  return out
}
