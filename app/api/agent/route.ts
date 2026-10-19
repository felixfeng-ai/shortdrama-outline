// 场记的一次模型往返（见 AGENT.md §3）。
//
// 循环在前端，这里只做一次调用：校验消息 → 扣 1 单位额度 → 带工具问模型 →
// 原样把「回答」或「要调的工具」交回去。工具的执行不在这里（数据在页面里）。
//
// 降级：DeepSeek 若在当前模型上不支持 tools（400），自动改成无工具问答，
// 并回一个 degraded 标记让界面说明「本次只能凭上下文回答」——而不是给用户一个报错。
import { NextResponse } from 'next/server'
import { InputError, errorResponse, ok } from '@/lib/api'
import { AiError, chatWithTools, chatJson, type ToolChatMessage } from '@/lib/deepseek'
import { AGENT_TOOL_SCHEMAS } from '@/lib/agent/tools'
import { toWireMessages } from '@/lib/agent/wire'
import { getDbForRequest } from '@/lib/assets/store'
import { chargeQuota, identityFromRequest } from '@/lib/quota'

export const runtime = 'nodejs'
export const maxDuration = 60

/** 场记的人格与纪律（工具怎么用写在 schema 的 description 里） */
const SYSTEM = `你是「成剧」里的 AI 场记：熟悉这部剧的进度、镜头与素材，也熟悉这个工具怎么用。
说话像剧组里那位靠谱的老场记——干脆、具体、不绕弯子，不喊"您好"，不说"希望对你有帮助"。

## 纪律
1. 中文回答，直接给结论，不要客套。默认 80 字以内，操作步骤类可以更长。
2. 涉及「项目里现在是什么情况」的问题，**先调工具查**，不要凭印象猜。
3. 涉及「怎么做」的问题（导出、拿去出图平台、批量出图、首尾帧衔接、额度），
   必须先调 search_docs，并在回答里带上出处。
4. 你**不能直接修改任何内容**：要改某一镜就用 propose_shot_edit，
   要重跑某一步就用 propose_regenerate。这两者只会生成待确认卡片，用户点了才生效。
   在回答里说清你提议了什么，不要假装已经改好。
5. 工具没查到的就说没查到，不要编。用户问的与这个项目无关时，简单说明你能帮什么即可。
6. 回答创作取舍（这一版好不好、要不要换方向）时，先调 get_project_status 读「创作意图」与「最近的判断」，
   涉及分集钩子或节奏时再调 review_episodes；不要重复推荐用户已经否决过的方向。`

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const messages = toWireMessages(body?.messages)
    if (messages.length === 0) throw new InputError('缺少对话内容')

    // 额度闸门：入参已校验、尚未调用模型。一次调用 = 1 单位
    chargeQuota(getDbForRequest(), identityFromRequest(req), 'agent')

    const withSystem: ToolChatMessage[] = [{ role: 'system', content: SYSTEM }, ...messages]

    try {
      const result = await chatWithTools(withSystem, AGENT_TOOL_SCHEMAS, { temperature: 0.5 })
      return NextResponse.json(ok({ ...result, degraded: false }))
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
        '你是「成剧」里的 AI 场记。用中文直接回答，80 字以内，干脆具体，不要客套。',
        lastUser,
        { temperature: 0.5, maxTokens: 600 },
      )
      return NextResponse.json(
        ok({ reply: reply.reply ?? reply.answer ?? '（这次没能回答，换个说法再问一次）', degraded: true }),
      )
    }
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
