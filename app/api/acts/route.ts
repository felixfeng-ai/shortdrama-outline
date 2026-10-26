// 第二步：基于人物生成三幕大纲
import { NextResponse } from 'next/server'
import { errorResponse, ok } from '@/lib/api'
import { readGenre } from '@/lib/types'
import { chatJson } from '@/lib/deepseek'
import { normalizeActs } from '@/lib/normalize'
import { buildActPrompt } from '@/lib/prompts'
import { readBrief } from '@/lib/brief'
import { readCharacters, readIdea } from '@/lib/validate'
import { getDbForRequest } from "@/lib/assets/store"
import { chargeQuota } from "@/lib/quota"
import { persistIfProject } from "@/lib/assets/persist"
import { assertProjectAccess } from "@/lib/assets/access"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : null
    if (projectId) assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const idea = readIdea(body?.idea)
    const characters = readCharacters(body?.characters, '请先生成核心人物，再生成三幕大纲')
    // 额度闸门：入参校验已通过、尚未调用模型。超限时抛 QuotaError(429)，
    // 由下面的 catch 统一翻译成中文，不会产生任何模型调用
    const genre = readGenre(body?.genre)
    const brief = readBrief(body?.brief)
    const variant = body?.variant === 'B' ? 'B' : 'A'
    chargeQuota(db, resolveRequestIdentity(db, req), "acts")


    const { system, user } = buildActPrompt(idea, characters, genre, brief)
    const raw = await chatJson<unknown>(system, user, { temperature: variant === 'B' ? 0.5 : 0.8 })
    const acts = normalizeActs(raw)

    // 落快照，血缘指向人物那一版；刷新后要靠它把大纲恢复出来
    persistIfProject(db, projectId, 'acts', acts, { kinds: ['characters'] })

    return NextResponse.json(ok({ acts }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
