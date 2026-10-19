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
import { chargeQuota, identityFromRequest } from "@/lib/quota"
import { persistIfProject } from "@/lib/assets/persist"

export const runtime = 'nodejs'
// 生成较慢，放宽函数超时（Vercel 上生效）
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const idea = readIdea(body?.idea)

    // 只重新生成一个角色时，把现有阵容传给模型，避免功能重复
    const mode = body?.mode === 'single' ? 'single' : 'batch'
    const existing = mode === 'single' ? readCharacters(body?.existing, '缺少现有角色，无法单独生成') : []
    // 额度闸门：入参校验已通过、尚未调用模型。超限时抛 QuotaError(429)，
    // 由下面的 catch 统一翻译成中文，不会产生任何模型调用
    const genre = readGenre(body?.genre)
    const brief = readBrief(body?.brief)
    chargeQuota(getDbForRequest(), identityFromRequest(req), "characters")


    const { system, user } =
      mode === 'single'
        ? buildSingleCharacterPrompt(idea, existing, genre, brief)
        : buildCharacterPrompt(idea, genre, brief)

    // 人物设定需要想象力，温度调高一些
    const raw = await chatJson<unknown>(system, user, { temperature: 1.0 })
    const characters = normalizeCharacters(raw)

    /*
      落快照：这一步以前不落库，于是「刷新页面 = 前六步全丢」。
      现在把「想法」本身也存成一版（kind=idea，整条链路的根），
      恢复项目时输入框里的那句话就能填回去，不用让用户重打。
      落库失败不影响生成结果（persistIfProject 内部兜住）。
    */
    const db = getDbForRequest()
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : null
    persistIfProject(db, projectId, 'idea', { idea, genre: genre.id }, { kinds: [] })
    persistIfProject(db, projectId, 'characters', characters, { kinds: ['idea'] })

    return NextResponse.json(
      ok(mode === 'single' ? { characters: [characters[0]] } : { characters }),
    )
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
