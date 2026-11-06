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
import { withQuotaReservation } from "@/lib/quota"
import { persistIfProject } from "@/lib/assets/persist"
import { assertProjectAccess } from "@/lib/assets/access"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { listProjectDecisions, listProjectJudgments } from "@/lib/assets/decisions"
import {
  buildVariantMemoryBlock,
  readVariantStrategy,
  variantPromptBlock,
} from "@/lib/variant-decision"

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
    const variantStrategy = readVariantStrategy(body?.variantStrategy)
    const comparison = body?.comparison === true
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "model", { identity })
    const { value } = await withQuotaReservation(db, identity, "acts", 1, async () => {
      const { system, user } = buildActPrompt(idea, characters, genre, brief)
      const memory = projectId
        ? buildVariantMemoryBlock(
          'acts',
          listProjectDecisions(db, projectId, 20),
          listProjectJudgments(db, projectId, 20),
        )
        : ''
      const raw = await chatJson<unknown>(
        system + (comparison ? variantPromptBlock(variantStrategy) : '') + memory,
        user,
        { temperature: variant === 'B' ? 0.5 : 0.8 },
      )
      const acts = normalizeActs(raw)

      if (!comparison) {
        persistIfProject(db, projectId, 'acts', acts, { kinds: ['characters'] })
      }
      return { acts }
    })

    return NextResponse.json(ok(value))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}
