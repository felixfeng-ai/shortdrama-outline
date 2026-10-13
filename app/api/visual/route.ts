// 视觉锚点：基于人物生成视觉定妆（B1），并顺带产出定妆图提示词（B2）。
// 一次请求产出两样东西，因为它们的输入完全相同（都是锚点），分成两次调用是浪费。
import { NextResponse } from "next/server"
import { errorResponse, ok } from "@/lib/api"
import { chatJson } from "@/lib/deepseek"
import { getDbForRequest } from "@/lib/assets/store"
import { createSnapshot, latestSnapshot } from "@/lib/assets/repo"
import { normalizeVisualCharacters } from "@/lib/assets/normalize"
import { buildImagePrompt, buildVisualPrompt } from "@/lib/assets/prompts"
import { readCharacters, readIdea } from "@/lib/validate"
import { persistIfProject } from "@/lib/assets/persist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const idea = readIdea(body?.idea)
    const characters = readCharacters(body?.characters, "请先生成核心人物，再做视觉定妆")
    const projectId = typeof body?.projectId === "string" ? body.projectId : null

    // 定妆需要想象力，温度调高
    const { system, user } = buildVisualPrompt(idea, characters)
    const raw = await chatJson<unknown>(system, user, { temperature: 1.0 })
    const visualCharacters = normalizeVisualCharacters(raw, characters.map((c) => c.name))

    // 出图提示词是纯文本产出，不调用任何图像 API（原则 P1）
    const img = buildImagePrompt(visualCharacters)
    const imageRaw = await chatJson<unknown>(img.system, img.user, { temperature: 0.8 })
    const imagePrompts = Array.isArray((imageRaw as Record<string, unknown>)?.imagePrompts)
      ? ((imageRaw as Record<string, unknown>).imagePrompts as unknown[])
      : []

    persistIfProject(getDbForRequest(), projectId, "visualCharacters", visualCharacters, {
      kinds: ["characters"],
    })

    return NextResponse.json(ok({ visualCharacters, imagePrompts }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
