// 场次剧本：把分集拆成场次（B3）。
// 场次是分镜的输入单位——一场戏 = 一个连续时空，是「本镜该带哪几张参考图」的依据。
import { NextResponse } from "next/server"
import { errorResponse, ok } from "@/lib/api"
import { chatJson } from "@/lib/deepseek"
import { getDbForRequest } from "@/lib/assets/store"
import { normalizeScenes } from "@/lib/assets/normalize"
import { buildScenePrompt } from "@/lib/assets/prompts"
import { persistIfProject } from "@/lib/assets/persist"
import { readCharacters, readEpisodes, readIdea } from "@/lib/validate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const idea = readIdea(body?.idea)
    const characters = readCharacters(body?.characters, "请先生成核心人物，再拆场次")
    const episodes = readEpisodes(body?.episodes, "请先生成分集剧情，再拆场次")
    const projectId = typeof body?.projectId === "string" ? body.projectId : null

    const { system, user } = buildScenePrompt(idea, characters, episodes)
    const raw = await chatJson<unknown>(system, user, { temperature: 0.8 })
    const scenes = normalizeScenes(raw)

    persistIfProject(getDbForRequest(), projectId, "scenes", scenes, {
      kinds: ["episodes", "characters"],
    })

    return NextResponse.json(ok({ scenes }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
