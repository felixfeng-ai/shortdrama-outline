// 第零步：关键词 → 一句话故事想法（联想候选）。
//
// 为什么单独开一个路由：它不属于六步工作流，是入口处的「帮我想」辅助，
// 因此走独立的额度权重（ideas），不占用一个完整项目（13 units）的预算。
import { NextResponse } from 'next/server'
import { errorResponse, ok, InputError } from '@/lib/api'
import { chatJson } from '@/lib/deepseek'
import { buildIdeaPrompt } from '@/lib/prompts'
import { GENRES, readGenre, MAX_IDEAS_PER_ROUND, MAX_KEYWORD_LENGTH } from '@/lib/types'
import { readRecommendedGenres } from '@/lib/prompts'
import { getDbForRequest } from '@/lib/assets/store'
import { chargeQuota, identityFromRequest } from '@/lib/quota'

export const runtime = 'nodejs'
export const maxDuration = 60

/** 关键词校验：比一句话想法更短，但必须非空 */
function readKeywords(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length < 1) {
    throw new InputError('请先输入一个关键词，比如「快递员」「钥匙」')
  }
  if (text.length > MAX_KEYWORD_LENGTH * 3) {
    throw new InputError(`关键词太长了，请控制在 ${MAX_KEYWORD_LENGTH * 3} 字以内`)
  }
  return text
}

/** 兜底：模型返回的字段名偶尔会飘，统一收敛成 { title, reason } */
function normalizeIdeas(raw: unknown): { title: string; reason: string }[] {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(src.ideas) ? src.ideas : []
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .slice(0, MAX_IDEAS_PER_ROUND)
    .map((item) => ({
      title: String(item.title ?? item.idea ?? item.text ?? '').trim().slice(0, 80),
      reason: String(item.reason ?? '').trim().slice(0, 40),
    }))
    .filter((item) => item.title.length > 0)
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const keywords = readKeywords(body?.keywords)
    const genre = readGenre(body?.genre)

    // 额度闸门：入参已校验、尚未调用模型
    chargeQuota(getDbForRequest(), identityFromRequest(req), 'ideas')

    const { system, user } = buildIdeaPrompt(keywords, genre, GENRES)
    // 联想需要发散，温度比人物生成再高一点
    const raw = await chatJson<unknown>(system, user, { temperature: 1.1 })
    const ideas = normalizeIdeas(raw)
    const genres = readRecommendedGenres(raw)

    return NextResponse.json(ok({ ideas, genres }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
