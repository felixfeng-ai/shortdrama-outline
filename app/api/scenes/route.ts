// 场次剧本：把分集拆成场次（B3）。
// 场次是分镜的输入单位——一场戏 = 一个连续时空，是「本镜该带哪几张参考图」的依据。
import { NextResponse } from "next/server"
import { errorResponse, ok } from "@/lib/api"
import { readGenre } from "@/lib/types"
import { chatJson } from "@/lib/deepseek"
import { getDbForRequest } from "@/lib/assets/store"
import { normalizePlaces, normalizeScenes } from "@/lib/assets/normalize"
import { buildScenePrompt } from "@/lib/assets/prompts"
import { persistIfProject } from "@/lib/assets/persist"
import { readCharacters, readEpisodes, readIdea } from "@/lib/validate"
import { chargeQuota } from "@/lib/quota"
import { assertProjectAccess } from "@/lib/assets/access"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const projectId = typeof body?.projectId === "string" ? body.projectId : null
    if (projectId) assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const idea = readIdea(body?.idea)
    const characters = readCharacters(body?.characters, "请先生成核心人物，再拆场次")
    const episodes = readEpisodes(body?.episodes, "请先生成分集剧情，再拆场次")
    // 额度闸门：入参校验已通过、尚未调用模型。超限时抛 QuotaError(429)，
    // 由下面的 catch 统一翻译成中文，不会产生任何模型调用
    const genre = readGenre(body?.genre)
    chargeQuota(db, resolveRequestIdentity(db, req), "scenes")


    const { system, user } = buildScenePrompt(idea, characters, episodes, genre)
    /*
      4000（默认）装不下这一步的产出：40 场戏本身约 3300 token，
      再加上 8-14 个地点的视觉锚点（约 2500），模型会把 JSON 提前闭合、
      把 places 整段省掉——实测就是这样丢的。给到 16000 留足余量。
      和分镜那一步同一个教训：下线写得下，上限没写对，产出就会静默缩水。
    */
    const raw = await chatJson<unknown>(system, user, { temperature: 0.8, maxTokens: 16000 })
    const scenes = normalizeScenes(raw)
    // 地点锚点与场次同一次调用产出，但作为独立快照存：
    // 它按「地点」去重，生命周期和场次不是一回事
    const places = normalizePlaces(raw)

    persistIfProject(db, projectId, "scenes", scenes, {
      kinds: ["episodes", "characters"],
    })
    persistIfProject(db, projectId, "visualPlaces", places, {
      kinds: ["episodes", "characters"],
    })

    return NextResponse.json(ok({ scenes, places }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
