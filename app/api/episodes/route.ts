// 第三步：基于人物 + 三幕大纲生成分集剧情（集数由前端选择）。
//
// 这一步是三步里唯一走流式的：分集内容量大，一次性等要几十秒，
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
import { readBrief } from '@/lib/brief'
import {
  episodeQuotaUnits,
  episodeTokenBudget,
  planEpisodeBatches,
  readEpisodeCount,
  readEpisodeStart,
} from '@/lib/episodes'
import { readGenre, type Act, type Character, type Episode } from '@/lib/types'
import { readActs, readCharacters, readIdea } from '@/lib/validate'
import { chargeQuota, identityFromRequest } from "@/lib/quota"
import { getDbForRequest } from "@/lib/assets/store"
import { persistIfProject } from "@/lib/assets/persist"

export const runtime = 'nodejs'
// 长集数要分多批写（60 集约 6 批），给足时间
export const maxDuration = 600

export async function POST(req: Request) {
  // 入参校验失败时流还没建立，按老规矩返回普通 JSON 信封，前端才能读到 error 文案
  let idea: string
  let characters: Character[]
  let acts: Act[]
  let genre: ReturnType<typeof readGenre>
  let projectId: string | null = null
  let count: number
  let brief: ReturnType<typeof readBrief>
  let start: number
  let total: number
  let preview: boolean
  let variant: 'A' | 'B'
  try {
    const body = await req.json().catch(() => null)
    idea = readIdea(body?.idea)
    characters = readCharacters(body?.characters, '请先生成核心人物，再生成分集剧情')
    acts = readActs(body?.acts, '请先生成三幕大纲，再生成分集剧情')
    genre = readGenre(body?.genre)
    projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : null
    count = readEpisodeCount(body?.count)
    brief = readBrief(body?.brief)
    start = readEpisodeStart(body?.start)
    total = readEpisodeCount(body?.total ?? start + count - 1, start + count - 1)
    preview = body?.preview === true
    variant = body?.variant === 'B' ? 'B' : 'A'
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }

  // 额度闸门：必须在建立 SSE 流之前扣。流一旦建立，再抛错前端读到的是
  // 断裂的事件流而不是可解析的 JSON 信封，错误文案就丢了。
  // 这里单独包一层 try/catch，与上面入参校验的处理方式保持一致。
  try {
    // 长集数按批次计价：每 10 集 3 单位，一次扣完，避免流建立后再抛额度错误
    chargeQuota(
      getDbForRequest(),
      identityFromRequest(req),
      "episodes",
      Date.now(),
      preview ? 1 : episodeQuotaUnits(count),
    )
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }

  const encoder = new TextEncoder()
  // 一次生成固定一个时间戳：同一集在多次推送里 id 保持不变，React 才不会重挂卡片
  const stamp = Date.now()
  const batches = planEpisodeBatches(count).map((b) => ({
    start: b.start + start - 1,
    end: b.end + start - 1,
  }))

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
        // 长集数分批写：每批 10 集，后一批带上前文的标题与梗概，避免重复与断裂
        const finalEpisodes: Episode[] = []
        for (const batch of batches) {
          const batchCount = batch.end - batch.start + 1
          const { system, user } = buildEpisodePrompt(idea, characters, acts, genre, {
            start: batch.start,
            count: batchCount,
            total,
            brief,
            previous: finalEpisodes
              .map((e) => `${e.number}. ${e.title}：${e.synopsis.slice(0, 60)}`)
              .join('\n'),
          })

          let buffer = ''
          let emitted = 0

          for await (const delta of streamChat(system, user, {
            temperature: variant === 'B' ? 0.7 : 0.85,
            maxTokens: episodeTokenBudget(batchCount),
            signal: req.signal,
          })) {
            buffer += delta

            const { items } = extractCompleteItems(buffer)
            if (items.length <= emitted) continue
            emitted = items.length

            // 每次推全量；offset 让第 11 集那批接在全剧编号后面
            const partial = normalizeEpisodes({ episodes: items }, stamp, {
              offset: batch.start - 1,
              limit: batchCount,
            })
            send('episodes', { episodes: [...finalEpisodes, ...partial] })
          }

          const batchEpisodes = normalizeEpisodes(parseJson<unknown>(buffer), stamp, {
            offset: batch.start - 1,
            limit: batchCount,
          })
          finalEpisodes.push(...batchEpisodes)
          send('episodes', { episodes: finalEpisodes })
        }

        // 落快照放在流末尾：中途失败不写半份分集，恢复出来的必须是一份完整的分集
        persistIfProject(getDbForRequest(), projectId, 'episodes', finalEpisodes, { kinds: ['acts'] })
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
