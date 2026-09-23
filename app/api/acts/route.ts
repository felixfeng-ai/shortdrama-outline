// 第二步：基于人物生成三幕大纲
import { NextResponse } from 'next/server'
import { errorResponse, ok } from '@/lib/api'
import { chatJson } from '@/lib/deepseek'
import { normalizeActs } from '@/lib/normalize'
import { buildActPrompt } from '@/lib/prompts'
import { readCharacters, readIdea } from '@/lib/validate'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const idea = readIdea(body?.idea)
    const characters = readCharacters(body?.characters, '请先生成核心人物，再生成三幕大纲')

    const { system, user } = buildActPrompt(idea, characters)
    const raw = await chatJson<unknown>(system, user, { temperature: 0.8 })

    return NextResponse.json(ok({ acts: normalizeActs(raw) }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
