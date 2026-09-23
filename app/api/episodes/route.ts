// 第三步：基于人物 + 三幕大纲生成 10 集分集剧情。
//
// 这一步是三步里唯一走流式的：10 集内容量大，一次性等要几十秒，
// 用户全程只能看骨架屏。改成分集一集一集地推给前端，边生成边渲染。
//
// 事件约定（SSE）：
//   event: episodes  data: { episodes: Episode[] }  已生成的部分结果（每次都是全量）
//   event: done      data: { episodes: Episode[] }  最终结果，以这一份为准
//   event: error     data: { error: string }        生成中途失败
import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api'
import { parseJson, streamChat } from '@/lib/deepseek'
import { normalizeEpisodes } from '@/lib/normalize'
import { extractCompleteItems } from '@/lib/partial-json'
import { buildEpisodePrompt } from '@/lib/prompts'
import type { Act, Character, Episode } from '@/lib/types'
import { readActs, readCharacters, readIdea } from '@/lib/validate'

export const runtime = 'nodejs'
// 10 集输出量大，给足时间
export const maxDuration = 180

export async function POST(req: Request) {
  // 入参校验失败时流还没建立，按老规矩返回普通 JSON 信封，前端才能读到 error 文案
  let idea: string
  let characters: Character[]
  let acts: Act[]
  try {
    const body = await req.json().catch(() => null)
    idea = readIdea(body?.idea)
    characters = readCharacters(body?.characters, '请先生成核心人物，再生成分集剧情')
    acts = readActs(body?.acts, '请先生成三幕大纲，再生成分集剧情')
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }

  const { system, user } = buildEpisodePrompt(idea, characters, acts)
  const encoder = new TextEncoder()
  // 一次生成固定一个时间戳：同一集在多次推送里 id 保持不变，React 才不会重挂卡片
  const stamp = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const finish = () => {
        if (closed) return
        closed = true
        controller.close()
      }

      try {
        let buffer = ''
        let emitted = 0

        for await (const delta of streamChat(system, user, {
          temperature: 0.85,
          maxTokens: 8000,
          signal: req.signal,
        })) {
          buffer += delta

          const { items } = extractCompleteItems(buffer)
          if (items.length <= emitted) continue
          emitted = items.length

          // 每次推全量而不是只推新增的那几集：normalizeEpisodes 按数组下标定集数，
          // 只喂新增部分的话每批都会从第 1 集重新编号
          send('episodes', { episodes: normalizeEpisodes(items, stamp) })
        }

        // 流结束。用完整缓冲区整体解析一次作为最终结果：
        // 增量扫描只认「已经闭合的对象」，模型若换了外层结构可能一集都抠不出来，
        // 这一步是兜底，保证拿到的结果和一次性调用时完全一致
        const finalEpisodes: Episode[] = normalizeEpisodes(parseJson<unknown>(buffer), stamp)
        send('done', { episodes: finalEpisodes })
        finish()
      } catch (error) {
        const { body } = errorResponse(error)
        send('error', { error: body.error })
        finish()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform 阻止中间层压缩/改写分块，否则流式会被攒成一坨
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // 显式告诉 nginx 不要缓冲这个响应，默认的 proxy_buffering 会把事件攒住不发
      'X-Accel-Buffering': 'no',
    },
  })
}
