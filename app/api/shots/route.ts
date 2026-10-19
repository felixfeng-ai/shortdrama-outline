// 分镜：把场次拆成镜头，SSE 流式返回（B4）。
//
// 这是三步文本生成里唯一走流式的接口（和 /api/episodes 同构）：
// 10+ 镜头一次性等要几十秒，改成一镜一镜地推给前端，边生成边渲染。
//
// 复用点（这正是「不重写流式」的落地）：
//   - lib/partial-json.ts 的 extractCompleteItems：从半截 JSON 里抠已闭合的镜头
//   - streamChat：流式调用
//   - 事件形状与 /api/episodes 完全一致
import { NextResponse } from "next/server"
import { errorResponse } from "@/lib/api"
import { readGenre } from '@/lib/types'
import { parseJson, streamChat } from "@/lib/deepseek"
import { getDbForRequest } from "@/lib/assets/store"
import { normalizeShots } from "@/lib/assets/normalize"
import { persistIfProject } from "@/lib/assets/persist"
import { buildShotPrompt } from "@/lib/assets/prompts"
import { readBrief } from "@/lib/brief"
import { readLook } from "@/lib/look"
import { buildPlaceRefMap, buildRefMap } from "@/lib/assets/refs"
import type { VisualCharacter } from "@/lib/assets/types"
import { extractCompleteItems } from "@/lib/partial-json"
import { readActs, readCharacters, readIdea } from "@/lib/validate"
import { chargeQuota, identityFromRequest } from "@/lib/quota"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// 分镜是六步里输出最大的一步：全片镜头数 ≈ 场次数 × 2~5，
// 40 场就是 80-200 镜。实测 61 镜约 12k token / 57s，留一倍余量。
export const maxDuration = 300

function readScenes(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("请先生成场次剧本，再拆镜头")
  }
  return value.slice(0, 200)
}

export async function POST(req: Request) {
  // 入参校验失败时流还没建立，返回普通 JSON 信封，前端才读得到 error 文案
  let idea: string
  let scenes: unknown[]
  let visuals: VisualCharacter[]
  let acts: ReturnType<typeof readActs>
  let genre: ReturnType<typeof readGenre>
  let projectId: string | null
  let brief: ReturnType<typeof readBrief>
  let look: ReturnType<typeof readLook>
  /** 地点名 -> 地点锚点串，整形时按 place 精确匹配 */
  const placeMap = new Map<string, string>()
  try {
    const body = await req.json().catch(() => null)
    idea = readIdea(body?.idea)
    readCharacters(body?.characters, "请先生成核心人物，再拆镜头")
    scenes = readScenes(body?.scenes)
    visuals = (Array.isArray(body?.visualCharacters) ? body.visualCharacters : []) as VisualCharacter[]
    acts = Array.isArray(body?.acts) ? readActs(body.acts) : []
    projectId = typeof body?.projectId === "string" ? body.projectId : null
    genre = readGenre(body?.genre)
    brief = readBrief(body?.brief)
    look = readLook(body?.look)
    // 地点锚点表：只认 name + anchor 都在的记录，缺一个就跳过——
    // 挂不上锚点比挂错锚点安全
    for (const p of (Array.isArray(body?.places) ? body.places : [])) {
      if (!p || typeof p !== "object") continue
      const row = p as Record<string, unknown>
      if (typeof row.name === "string" && row.name && typeof row.anchor === "string" && row.anchor) {
        placeMap.set(row.name, row.anchor)
      }
    }
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }

  // 额度闸门：同 episodes，必须在 new ReadableStream 之前
  try {
    chargeQuota(getDbForRequest(), identityFromRequest(req), "shots")
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }

  const { system, user } = buildShotPrompt(idea, scenes as never, visuals, acts, genre, brief, look)
  const encoder = new TextEncoder()
  // 一次生成固定一个 stamp：同一镜在多次推送里 id 保持不变，React 才不会重挂卡片
  const stamp = Date.now()

  // 图台账 -> 角色名到图标签的映射（B6：标注本镜该带哪几张参考图）
  const refMap = buildRefMap(getDbForRequest(), projectId)
  // 场景图：按地点名挂，并进本镜参考图
  const placeRefMap = buildPlaceRefMap(getDbForRequest(), projectId)

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
        let buffer = ""
        let emitted = 0

        for await (const delta of streamChat(system, user, {
          temperature: 0.85,
          // 原来 8000 会在场次正常（40 场）时把 JSON 拦腰截断（finish_reason: length），
          // 表现为「AI 返回的内容不是合法 JSON」——不是模型的问题，是我们的输出预算太小
          maxTokens: 24000,
          signal: req.signal,
        })) {
          buffer += delta

          const { items } = extractCompleteItems(buffer, "shots")
          if (items.length <= emitted) continue
          emitted = items.length

          // 每次推全量：normalizeShots 按下标定镜号，只推增量会导致每批从第 1 镜重新编号
          send("shots", { shots: normalizeShots({ raw: { shots: items }, visuals, refMap, placeMap, placeRefMap, stamp }) })
        }

        // 流结束，用完整缓冲区整体解析一次兜底，保证与一次性调用结果一致
        const finalShots = normalizeShots({ raw: parseJson<unknown>(buffer), visuals, refMap, placeMap, placeRefMap, stamp })
        persistIfProject(getDbForRequest(), projectId, "shots", finalShots, {
          kinds: ["scenes", "visualCharacters"],
        })
        send("done", { shots: finalShots })
        finish()
      } catch (error) {
        const { body } = errorResponse(error)
        send("error", { error: body.error })
        finish()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform 阻止中间层压缩/改写分块，否则流式会被攒成一坨
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 显式告诉 nginx 不要缓冲这个响应
      "X-Accel-Buffering": "no",
    },
  })
}
