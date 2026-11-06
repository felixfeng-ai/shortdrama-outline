// 第一步：根据一句话想法生成 3-5 个核心人物。
// 同一个路由支持两种模式：
//   mode = 'batch'（默认）→ 一次生成整组角色
//   mode = 'single'        → 只补一个新角色，用于「单独重新生成某个人物」
import { NextResponse } from 'next/server'
import { errorResponse, ok } from '@/lib/api'
import { readGenre } from '@/lib/types'
import { chatJson } from '@/lib/deepseek'
import { normalizeCharacters } from '@/lib/normalize'
import { buildCharacterPrompt, buildSingleCharacterPrompt } from '@/lib/prompts'
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
// 生成较慢，放宽函数超时（Vercel 上生效）
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : null
    if (projectId) assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const idea = readIdea(body?.idea)

    // 只重新生成一个角色时，把现有阵容传给模型，避免功能重复
    const mode = body?.mode === 'single' ? 'single' : 'batch'
    const existing = mode === 'single' ? readCharacters(body?.existing, '缺少现有角色，无法单独生成') : []
    // 额度闸门：入参校验已通过、尚未调用模型。超限时抛 QuotaError(429)，
    // 由下面的 catch 统一翻译成中文，不会产生任何模型调用
    const genre = readGenre(body?.genre)
    const brief = readBrief(body?.brief)
    const variant = body?.variant === 'B' ? 'B' : 'A'
    const variantStrategy = readVariantStrategy(body?.variantStrategy)
    const comparison = body?.comparison === true
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "model", { identity })
    const { value } = await withQuotaReservation(db, identity, "characters", 1, async () => {
      const { system, user } =
        mode === 'single'
          ? buildSingleCharacterPrompt(idea, existing, genre, brief)
          : buildCharacterPrompt(idea, genre, brief)
      const memory = projectId
        ? buildVariantMemoryBlock(
          'characters',
          listProjectDecisions(db, projectId, 20),
          listProjectJudgments(db, projectId, 20),
        )
        : ''
      const systemWithMemory = system
        + (comparison ? variantPromptBlock(variantStrategy) : '')
        + memory

      const raw = await chatJson<unknown>(systemWithMemory, user, {
        temperature: variant === 'B' ? 0.7 : 1.0,
      })
      const characters = normalizeCharacters(raw)

      if (!comparison) {
        persistIfProject(db, projectId, 'idea', { idea, genre: genre.id }, { kinds: [] })
        persistIfProject(db, projectId, 'characters', characters, { kinds: ['idea'] })
      }

      return mode === 'single' ? { characters: [characters[0]] } : { characters }
    })

    return NextResponse.json(ok(value))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}
