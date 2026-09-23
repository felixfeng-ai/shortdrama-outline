// 第三步：基于人物 + 三幕大纲生成 10 集分集剧情
import { NextResponse } from 'next/server'
import { errorResponse, ok } from '@/lib/api'
import { chatJson } from '@/lib/deepseek'
import { normalizeEpisodes } from '@/lib/normalize'
import { buildEpisodePrompt } from '@/lib/prompts'
import { readActs, readCharacters, readIdea } from '@/lib/validate'

export const runtime = 'nodejs'
// 10 集输出量大，给足时间
export const maxDuration = 180

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const idea = readIdea(body?.idea)
    const characters = readCharacters(body?.characters, '请先生成核心人物，再生成分集剧情')
    const acts = readActs(body?.acts, '请先生成三幕大纲，再生成分集剧情')

    const { system, user } = buildEpisodePrompt(idea, characters, acts)
    // 分集要覆盖 10 集内容，max_tokens 给足，避免被截断成非法 JSON
    const raw = await chatJson<unknown>(system, user, { temperature: 0.85, maxTokens: 8000 })

    return NextResponse.json(ok({ episodes: normalizeEpisodes(raw) }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
