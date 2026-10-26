// 放映厅上方的 AI 助手：就着「当前这一镜」提要求，返回可直接写回的文本。
//
// 与六步生成的区别：它不改大纲，只改被问到的那一镜，因此走独立的额度权重
// （assistant = 1），不占一个完整项目的预算。
import { NextResponse } from 'next/server'
import { InputError, errorResponse, ok } from '@/lib/api'
import { chatJson } from '@/lib/deepseek'
import { buildAssistantPrompt, parseAssistantReply, readQuestion, type AssistantShot } from '@/lib/assistant'
import { readGenre } from '@/lib/types'
import { getDbForRequest } from '@/lib/assets/store'
import { chargeQuota } from '@/lib/quota'
import { resolveRequestIdentity } from '@/lib/auth/request'

export const runtime = 'nodejs'
export const maxDuration = 60

function readShot(value: unknown): AssistantShot | undefined {
  if (!value || typeof value !== 'object') return undefined
  const src = value as Record<string, unknown>
  const num = Number(src.shot)
  if (!Number.isFinite(num)) return undefined
  const params = (src.params ?? {}) as Record<string, unknown>
  return {
    shot: Math.max(1, Math.floor(num)),
    scene: String(src.scene ?? '').slice(0, 120),
    characters: Array.isArray(src.characters) ? src.characters.map((c) => String(c).slice(0, 40)).slice(0, 8) : [],
    action: String(src.action ?? '').slice(0, 600),
    shotSize: String(src.shotSize ?? '').slice(0, 20),
    camera: String(src.camera ?? '').slice(0, 40),
    prompt: String(src.prompt ?? '').slice(0, 4000),
    ratio: String(params.ratio ?? '9:16').slice(0, 12),
    duration: Number.isFinite(Number(params.duration)) ? Number(params.duration) : 5,
  }
}

function readCast(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .slice(0, 8)
    .map((c) => ({
      name: String(c.name ?? '').slice(0, 40),
      identity: String(c.identity ?? '').slice(0, 200),
      personality: String(c.personality ?? '').slice(0, 200),
    }))
    .filter((c) => c.name)
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    // readQuestion 是纯函数（便于单测），这里把它的报错翻成接口层的 400
    let question: string
    try {
      question = readQuestion(body?.question)
    } catch (e) {
      throw new InputError(e instanceof Error ? e.message : '提问不合法')
    }

    // 额度闸门：入参已校验、尚未调用模型
    const db = getDbForRequest()
    chargeQuota(db, resolveRequestIdentity(db, req), 'assistant')

    const { system, user } = buildAssistantPrompt(question, {
      idea: typeof body?.idea === 'string' ? body.idea.slice(0, 500) : '',
      genre: readGenre(body?.genre),
      shot: readShot(body?.shot),
      characters: readCast(body?.characters),
    })

    let raw: unknown
    try {
      raw = await chatJson<unknown>(system, user, { temperature: 0.6 })
    } catch {
      throw new InputError('助手暂时没回应，稍后再试一次')
    }
    return NextResponse.json(ok(parseAssistantReply(raw)))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
