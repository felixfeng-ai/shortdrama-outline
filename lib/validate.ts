// 三个 API 路由共用的请求参数校验。
// 这些接口是公开的、且每次调用都要花真金白银，所以入参必须有硬上限：
// 截断超长字段、限制数组长度，避免有人塞一个几 MB 的 body 把 token 烧光。

import { InputError } from './api'
import type { Act, ActKey, Character } from './types'

export const MAX_IDEA_LENGTH = 500
const MIN_IDEA_LENGTH = 4
/** 与界面上的上限保持一致：最多 5 个人物、3 幕、每幕 8 个情节点 */
const MAX_CHARACTERS = 5
const MAX_ACTS = 3
const MAX_BEATS = 8
/** 单个文本字段的字符上限，超出直接截断 */
const MAX_FIELD = 400

const ACT_KEYS: ActKey[] = ['setup', 'conflict', 'resolution']

/** 转成字符串并截断 */
function clamp(value: unknown, max = MAX_FIELD): string {
  const text = typeof value === 'string' ? value : ''
  return text.length > max ? text.slice(0, max) : text
}

function isObject(item: unknown): item is Record<string, unknown> {
  return !!item && typeof item === 'object' && !Array.isArray(item)
}

/** 校验一句话想法 */
export function readIdea(value: unknown): string {
  const idea = typeof value === 'string' ? value.trim() : ''
  if (idea.length < MIN_IDEA_LENGTH) {
    throw new InputError(`请先输入一句话故事想法（至少 ${MIN_IDEA_LENGTH} 个字）`)
  }
  if (idea.length > MAX_IDEA_LENGTH) {
    throw new InputError(`故事想法太长了，请控制在 ${MAX_IDEA_LENGTH} 字以内`)
  }
  return idea
}

/** 校验人物列表 */
export function readCharacters(value: unknown, hint = '请先生成核心人物'): Character[] {
  const list = (Array.isArray(value) ? value : [])
    .filter(isObject)
    .slice(0, MAX_CHARACTERS)
    .map((item, index) => ({
      id: clamp(item.id, 64) || `char-${index}`,
      name: clamp(item.name, 40),
      identity: clamp(item.identity),
      personality: clamp(item.personality),
      motivation: clamp(item.motivation),
      arc: clamp(item.arc),
    }))

  if (list.length === 0) throw new InputError(hint)
  return list
}

/** 校验三幕列表 */
export function readActs(value: unknown, hint = '请先生成三幕大纲'): Act[] {
  const list = (Array.isArray(value) ? value : [])
    .filter(isObject)
    .slice(0, MAX_ACTS)
    .map((item, index) => {
      const rawKey = clamp(item.key, 20) as ActKey
      return {
        id: clamp(item.id, 64) || `act-${index}`,
        // 只接受三个合法值，其余按位置兜底
        key: ACT_KEYS.includes(rawKey) ? rawKey : ACT_KEYS[index] ?? 'setup',
        title: clamp(item.title, 60),
        summary: clamp(item.summary, 1000),
        beats: (Array.isArray(item.beats) ? item.beats : [])
          .slice(0, MAX_BEATS)
          .map((beat) => clamp(beat))
          .filter(Boolean),
      }
    })

  if (list.length === 0) throw new InputError(hint)
  return list
}
