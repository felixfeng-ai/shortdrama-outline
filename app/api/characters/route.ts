// 第一步：根据一句话想法生成 3-5 个核心人物。
// 同一个路由支持两种模式：
//   mode = 'batch'（默认）→ 一次生成整组角色
//   mode = 'single'        → 只补一个新角色，用于「单独重新生成某个人物」
import { NextResponse } from 'next/server'
import { errorResponse, ok } from '@/lib/api'
import { chatJson } from '@/lib/deepseek'
import { normalizeCharacters } from '@/lib/normalize'
import { buildCharacterPrompt, buildSingleCharacterPrompt } from '@/lib/prompts'
import { readCharacters, readIdea } from '@/lib/validate'

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

    const { system, user } =
      mode === 'single' ? buildSingleCharacterPrompt(idea, existing) : buildCharacterPrompt(idea)

    // 人物设定需要想象力，温度调高一些
    const raw = await chatJson<unknown>(system, user, { temperature: 1.0 })
    const characters = normalizeCharacters(raw)

    return NextResponse.json(
      ok(mode === 'single' ? { characters: [characters[0]] } : { characters }),
    )
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
