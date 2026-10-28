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
import type { Scene, Shot, VisualCharacter } from "@/lib/assets/types"
import { extractCompleteItems } from "@/lib/partial-json"
import { readActs, readCharacters, readIdea } from "@/lib/validate"
import { chargeQuota } from "@/lib/quota"
import { assertProjectAccess } from "@/lib/assets/access"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import {
  planShotBatches,
  shotBatchLabel,
  shotTokenBudget,
} from "@/lib/shots"
import {
  checkpointSignature,
  clearTextGenerationCheckpoint,
  loadTextGenerationCheckpoint,
  saveTextGenerationCheckpoint,
} from "@/lib/generation/checkpoint"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// 分镜是六步里输出最大的一步：全片镜头数 ≈ 场次数 × 2~5，
// 40 场就是 80-200 镜。实测 61 镜约 12k token / 57s，留一倍余量。
export const maxDuration = 600

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
  let characters: ReturnType<typeof readCharacters>
  let resumeRequested: boolean
  /** 地点名 -> 地点锚点串，整形时按 place 精确匹配 */
  const placeMap = new Map<string, string>()
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    projectId = typeof body?.projectId === "string" ? body.projectId : null
    if (projectId) assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    idea = readIdea(body?.idea)
    characters = readCharacters(body?.characters, "请先生成核心人物，再拆镜头")
    scenes = readScenes(body?.scenes)
    visuals = (Array.isArray(body?.visualCharacters) ? body.visualCharacters : []) as VisualCharacter[]
    acts = Array.isArray(body?.acts) ? readActs(body.acts) : []
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
    resumeRequested = body?.resume === true
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }

  const db = getDbForRequest()
  const identity = resolveRequestIdentity(db, req)
  try {
    enforceApiRateLimit(db, req, "model", { identity })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
  const sceneRows = scenes as Scene[]
  const signature = checkpointSignature("shots", {
    idea,
    characters,
    scenes: sceneRows,
    visuals,
    acts,
    genre: genre.id,
    brief,
    look,
    places: Array.from(placeMap.entries()),
  })
  const checkpoint = projectId && resumeRequested
    ? loadTextGenerationCheckpoint<{ shots?: unknown; stamp?: unknown }>(
      db,
      projectId,
      "shots",
      signature,
    )
    : null
  const resumedShots = checkpoint && Array.isArray(checkpoint.state?.shots)
    ? checkpoint.state.shots as Shot[]
    : []
  const resumedStamp = checkpoint && Number.isFinite(Number(checkpoint.state?.stamp))
    ? Math.floor(Number(checkpoint.state.stamp))
    : Date.now()
  const allBatches = planShotBatches(sceneRows.length)
  const batches = checkpoint
    ? allBatches.filter((batch) => batch.sceneStart >= checkpoint.cursor)
    : allBatches
  const shotUnits = Math.max(
    1,
    Math.ceil(4 * batches.length / Math.max(1, allBatches.length)),
  )

  // 额度闸门：同 episodes，必须在 new ReadableStream 之前；续跑只收尚未完成批次的额度。
  try {
    chargeQuota(db, identity, "shots", Date.now(), shotUnits)
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }

  const encoder = new TextEncoder()
  // 一次生成固定一个 stamp：同一镜在多次推送里 id 保持不变，React 才不会重挂卡片
  const stamp = resumedStamp
  let lastCheckpointCursor = checkpoint?.cursor ?? 1

  // 图台账 -> 角色名到图标签的映射（B6：标注本镜该带哪几张参考图）
  const refMap = buildRefMap(db, projectId)
  // 场景图：按地点名挂，并进本镜参考图
  const placeRefMap = buildPlaceRefMap(db, projectId)

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
        const finalShots: Shot[] = [...resumedShots]
        if (checkpoint) {
          send("resume", {
            shots: finalShots,
            cursor: checkpoint.cursor,
          })
        }
        for (const batch of batches) {
          const batchScenes = sceneRows.slice(batch.sceneStart - 1, batch.sceneEnd)
          const previous = finalShots
            .slice(-4)
            .map((shot) => `第 ${shot.shot} 镜：${shot.scene} · ${shot.action}`)
            .join("\n")
          const { system, user } = buildShotPrompt(
            idea,
            batchScenes,
            visuals,
            acts,
            genre,
            brief,
            look,
            {
              sceneStart: batch.sceneStart,
              sceneTotal: sceneRows.length,
              previous,
            },
          )
          send("progress", {
            batch: batch.index,
            batchCount: batches.length,
            sceneStart: batch.sceneStart,
            sceneEnd: batch.sceneEnd,
            label: shotBatchLabel(batch, sceneRows.length),
          })

          let buffer = ""
          let emitted = 0
          for await (const delta of streamChat(system, user, {
            temperature: 0.85,
            maxTokens: shotTokenBudget(batchScenes.length),
            signal: req.signal,
          })) {
            buffer += delta
            const { items } = extractCompleteItems(buffer, "shots")
            if (items.length <= emitted) continue
            emitted = items.length
            const partial = normalizeShots({
              raw: { shots: items },
              visuals,
              refMap,
              placeMap,
              placeRefMap,
              stamp,
              offset: finalShots.length,
            })
            send("shots", { shots: [...finalShots, ...partial] })
          }

          const batchShots = normalizeShots({
            raw: parseJson<unknown>(buffer),
            visuals,
            refMap,
            placeMap,
            placeRefMap,
            stamp,
            offset: finalShots.length,
          })
          finalShots.push(...batchShots)
          send("shots", { shots: finalShots })
          lastCheckpointCursor = batch.sceneEnd + 1
          if (projectId) {
            saveTextGenerationCheckpoint(db, {
              projectId,
              kind: "shots",
              signature,
              cursor: lastCheckpointCursor,
              state: { shots: finalShots, stamp },
            })
          }
        }

        persistIfProject(db, projectId, "shots", finalShots, {
          kinds: ["scenes", "visualCharacters"],
        })
        if (projectId) clearTextGenerationCheckpoint(db, projectId, "shots")
        send("done", { shots: finalShots })
        finish()
      } catch (error) {
        const { body } = errorResponse(error)
        send("error", {
          error: body.error,
          resume: {
            available: Boolean(projectId),
            cursor: lastCheckpointCursor,
          },
        })
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
