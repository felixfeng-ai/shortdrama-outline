// 场记的一次模型往返（见 AGENT.md §3）。
//
// 循环在前端，这里只做一次调用：校验消息 → 扣 1 单位额度 → 带工具问模型 →
// 原样把「回答」或「要调的工具」交回去。工具的执行不在这里（数据在页面里）。
//
// 降级：DeepSeek 若在当前模型上不支持 tools（400），自动改成无工具问答，
// 并回一个 degraded 标记让界面说明「本次只能凭上下文回答」——而不是给用户一个报错。
import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'
import { InputError, errorResponse, ok } from '@/lib/api'
import { AiError, chatWithTools, chatJson, type ToolChatMessage } from '@/lib/deepseek'
import { AGENT_TOOL_SCHEMAS } from '@/lib/agent/tools'
import { toWireMessages } from '@/lib/agent/wire'
import { AGENT_SYSTEM_PROMPT } from '@/lib/agent/system'
import { buildAgentIntentSystemBlock, detectAgentIntent } from '@/lib/agent/intent'
import { getDbForRequest } from '@/lib/assets/store'
import { releaseQuota, reserveQuota, settleQuota } from '@/lib/quota'
import { AGENT_CHAT_MAX_CALLS } from '@/lib/agent/loop'
import { resolveRequestIdentity } from '@/lib/auth/request'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  let reservationId: string | null = null
  try {
    const body = await req.json().catch(() => null)
    const messages = toWireMessages(body?.messages)
    if (messages.length === 0) throw new InputError('缺少对话内容')
    const turnId = typeof body?.turnId === 'string' && body.turnId.trim()
      ? body.turnId.trim().slice(0, 120)
      : randomUUID()
    const skillMode = body?.mode === 'skill'
    const requestedLimit = Math.floor(Number(body?.maxUnits))
    const turnLimit = skillMode
      ? Math.min(6, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : AGENT_CHAT_MAX_CALLS))
      : AGENT_CHAT_MAX_CALLS
    const requestId = [
      turnId,
      createHash('sha256').update(JSON.stringify(messages)).digest('hex').slice(0, 24),
    ].join(':')

    const db = getDbForRequest()
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "assistant", { identity })
    const hold = reserveQuota(db, identity, 'agent', {
      requestId,
      units: 1,
      groupId: turnId,
      groupLimit: turnLimit,
    })
    reservationId = hold.id

    const withSystem: ToolChatMessage[] = [
      {
        role: 'system',
        content: `${AGENT_SYSTEM_PROMPT}

${buildAgentIntentSystemBlock(detectAgentIntent(
  [...messages].reverse().find((message) => message.role === 'user')?.content ?? '',
))}`,
      },
      ...messages,
    ]

    try {
      const result = await chatWithTools(withSystem, AGENT_TOOL_SCHEMAS, { temperature: 0.5 })
      settleQuota(db, hold.id, 1)
      return NextResponse.json(ok({
        ...result,
        degraded: false,
        intent: detectAgentIntent(
          [...messages].reverse().find((message) => message.role === 'user')?.content ?? '',
        ).intent,
        turnId,
        turnLimit,
        turnUsed: 1,
      }))
    } catch (error) {
      /*
        带工具的这一路失败就退化成无工具问答。
        不要按 status === 400 判断：assertOk 把上游所有 4xx 都映射成了通用的 502
        （只保留 401/429），所以「模型不支持 tools」在错误对象上根本看不出 400。
        直接降级更稳——代价是失败路径多一次调用，而这条路径本来就是异常。
      */
      if (!(error instanceof AiError)) throw error
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
      const reply = await chatJson<{ reply?: string; answer?: string }>(
        '你是「VeyaTV」里的 AI 场记。用中文直接回答，80 字以内，干脆具体，不要客套。',
        lastUser,
        { temperature: 0.5, maxTokens: 600 },
      )
      settleQuota(db, hold.id, 1)
      return NextResponse.json(
        ok({
          reply: reply.reply ?? reply.answer ?? '（这次没能回答，换个说法再问一次）',
          degraded: true,
          intent: detectAgentIntent(lastUser).intent,
          turnId,
          turnLimit,
          turnUsed: 1,
        }),
      )
    }
  } catch (error) {
    if (reservationId) {
      releaseQuota(
        getDbForRequest(),
        reservationId,
        error instanceof Error ? error.message : 'agent_failed',
      )
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}
