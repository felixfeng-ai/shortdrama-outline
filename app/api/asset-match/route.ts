// AI 兜底：当文件名/目录名里没有任何可用信息时，让模型帮忙判断每张图是谁。
//
// 为什么必须有这条路径：真实数据里出现过「陈砚」被上游平台写成 "Cheng Yan"
// （多一个 g，声母错拼）。拼音折叠是确定性算法，对这种错拼无能为力。
// 算法救不了的场景不能变成死路，所以给一个显式按钮兜底。
//
// ★ 边界（必须守住）：
//   1. 只上传「文件名/目录名这些字符串」，绝不上传图片本身
//   2. 必须由用户显式点击触发，不做自动调用（自动调用既慢又花钱，还可能悄悄挂错）
//   3. 返回的是「建议」，界面上要逐条可确认/可改，不能直接落库
import { NextResponse } from 'next/server'
import { errorResponse, ok, InputError } from '@/lib/api'
import { chatJson } from '@/lib/deepseek'
import { buildAssetMatchPrompt } from '@/lib/assets/prompts'
import { getDbForRequest } from '@/lib/assets/store'
import { chargeQuota, identityFromRequest } from '@/lib/quota'
import { readGenre } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/** 一次最多让模型判断多少张图（防止用户把一整个硬盘丢进来） */
const MAX_FILES = 60
/** 文件名本身可能很长（出图平台会把整段提示词当文件名），截断后再送模型 */
const MAX_NAME_LENGTH = 120

interface IncomingFile { key?: unknown; name?: unknown }

/** 只读出「字符串形式的路径」，任何带二进制字段的请求一律拒绝（与 /api/refs 同一原则） */
const FORBIDDEN = ['data', 'base64', 'blob', 'buffer', 'content', 'image', 'bytes', 'file']

function readFiles(value: unknown): { key: string; name: string }[] {
  if (!Array.isArray(value)) throw new InputError('缺少要识别的图片列表')

  const out: { key: string; name: string }[] = []
  for (const raw of value) {
    const item = (raw ?? {}) as Record<string, unknown>
    for (const bad of FORBIDDEN) {
      if (bad in item) throw new InputError('本接口只接收文件名，不接受图片内容本身')
    }
    const key = typeof item.key === 'string' ? item.key.trim() : ''
    const name = typeof item.name === 'string' ? item.name.trim() : key.split('/').pop() ?? ''
    if (!key) continue
    out.push({ key: key.slice(0, MAX_NAME_LENGTH), name: name.slice(0, MAX_NAME_LENGTH) })
  }

  if (out.length === 0) throw new InputError('没有要识别的图片')
  if (out.length > MAX_FILES) throw new InputError(`一次最多识别 ${MAX_FILES} 张，请分批`)
  return out
}

function readNames(value: unknown): string[] {
  const list = Array.isArray(value) ? value : []
  const names = list
    .filter((n): n is string => typeof n === 'string')
    .map((n) => n.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 20)
  if (names.length === 0) throw new InputError('请先生成核心人物，再让 AI 认图')
  return names
}

/**
 * 收敛模型输出：字段名偶尔会飘，且模型可能编出不存在的角色名。
 * 只保留「角色名在候选列表里、文件名在输入列表里」的配对，其余一律丢弃。
 */
function normalizeMatches(
  raw: unknown,
  names: string[],
  files: { key: string; name: string }[],
): { character: string; key: string; confidence: 'high' | 'low'; reason: string }[] {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(src.matches) ? src.matches : []
  const validKeys = new Set(files.map((f) => f.key))
  const validNames = new Set(names)

  const out: { character: string; key: string; confidence: 'high' | 'low'; reason: string }[] = []
  const used = new Set<string>()

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const character = String(row.character ?? row.name ?? row.role ?? '').trim()
    const key = String(row.key ?? row.file ?? row.filename ?? '').trim()
    if (!validNames.has(character) || !validKeys.has(key)) continue
    if (used.has(key)) continue        // 一张图只归一个角色
    used.add(key)
    out.push({
      character,
      key,
      // 模型自称 high 才敢标 high，其余一律 low —— 界面会据此提示「请确认」
      confidence: String(row.confidence ?? '').toLowerCase() === 'high' ? 'high' : 'low',
      reason: String(row.reason ?? '').trim().slice(0, 60),
    })
  }
  return out
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const files = readFiles(body?.files)
    const names = readNames(body?.characters)
    const genre = readGenre(body?.genre)

    // 额度闸门：入参已校验、尚未调用模型。走 visual 权重（这是一次美术判断）
    chargeQuota(getDbForRequest(), identityFromRequest(req), 'assetMatch')

    const { system, user } = buildAssetMatchPrompt(names, files, genre)
    // 判断归属需要推理但不需要发散，温度压低
    const raw = await chatJson<unknown>(system, user, { temperature: 0.2 })
    const matches = normalizeMatches(raw, names, files)

    return NextResponse.json(ok({ matches, scanned: files.length, characters: names.length }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
