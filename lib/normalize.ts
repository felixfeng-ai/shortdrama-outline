// 把模型返回的原始数据「整形」成前端可以直接用的结构。
// 模型偶尔会漏字段、写错 key、把数组包在多余的对象里，这里统一兜底，
// 保证界面拿到的数据一定是完整的。

import { AiError } from './deepseek'
import type { Act, ActKey, Character, Episode } from './types'

const ACT_KEYS: ActKey[] = ['setup', 'conflict', 'resolution']

/** 取字符串字段，缺失时返回兜底文案 */
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** 从 json 里取数组：允许 { characters: [...] } 或直接 [...] */
function pickArray(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const value = (raw as Record<string, unknown>)[key]
    if (Array.isArray(value)) return value
  }
  return []
}

export function normalizeCharacters(raw: unknown): Character[] {
  const list = pickArray(raw, 'characters')
  const characters = list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, index) => ({
      id: `char-${index}-${Date.now()}`,
      name: str(item.name, `角色 ${index + 1}`),
      identity: str(item.identity, '身份待补充'),
      personality: str(item.personality, '性格待补充'),
      motivation: str(item.motivation, '动机待补充'),
      arc: str(item.arc, '人物弧光待补充'),
    }))

  if (characters.length === 0) {
    throw new AiError('AI 没有生成出有效角色，请重新生成', 502)
  }
  // 只要前 5 个，保证界面不被刷屏
  return characters.slice(0, 5)
}

export function normalizeActs(raw: unknown): Act[] {
  const list = pickArray(raw, 'acts')
  const acts = list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, index) => {
      // key 只信任三个合法值，其余按位置推断
      const rawKey = str(item.key) as ActKey
      const key = ACT_KEYS.includes(rawKey) ? rawKey : ACT_KEYS[index] ?? 'setup'
      const beats = Array.isArray(item.beats)
        ? item.beats.map((b) => str(b)).filter(Boolean)
        : []
      return {
        // id 必须带上下标：模型可能重复返回同一个 key，只用 key 会撞出重复的 React key
        id: `act-${index}-${Date.now()}`,
        key,
        title: str(item.title, `第${index + 1}幕`),
        summary: str(item.summary, '这一幕的剧情待补充'),
        beats: beats.length > 0 ? beats : ['情节点待补充'],
      }
    })

  if (acts.length === 0) {
    throw new AiError('AI 没有生成出有效的大纲，请重新生成', 502)
  }
  return acts.slice(0, 3)
}

/**
 * 分集整形。
 *
 * stamp 用于生成 id：流式生成时同一个数组会被反复整形（每收到一集就推一次），
 * 用 Date.now() 的话每次 id 都变，React 会把已经渲染好的卡片全部重挂。
 * 调用方在一次生成开始时取一次 Date.now() 传进来即可。
 */
export function normalizeEpisodes(raw: unknown, stamp: number = Date.now()): Episode[] {
  const list = pickArray(raw, 'episodes')
  const episodes = list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, index) => ({
      id: `ep-${index}-${stamp}`,
      // 集数以数组下标为准，避免模型写错 number 导致界面乱序
      number: index + 1,
      title: str(item.title, `第 ${index + 1} 集`),
      synopsis: str(item.synopsis, '剧情梗概待补充'),
      hook: str(item.hook, '结尾钩子待补充'),
    }))

  if (episodes.length === 0) {
    throw new AiError('AI 没有生成出有效的分集，请重新生成', 502)
  }
  return episodes.slice(0, 10)
}
