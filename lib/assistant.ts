// AI 助手（放映厅上方的提问条）。
//
// 为什么单独一个模块：它跟六步生成是两件事——六步是「从无到有」，
// 助手是「就着已经有的东西改」。提问要能落地成可写回的文本，
// 所以提示词与解析都在这里，路由和界面只负责搬运。
//
// 纪律：只改被问到的那一镜，不重写大纲；答不出来就老实说，不许编。
import type { Genre } from './types'

/** 助手能写回的目标：英文提示词 / 中文动作描述 / 只回答不改动 */
export type AssistantTarget = 'prompt' | 'action' | 'none'

export interface AssistantShot {
  shot: number
  scene: string
  characters: string[]
  action: string
  /** 景别：观众离人物多远 */
  shotSize: string
  /** 运镜：镜头怎么动 */
  camera: string
  prompt: string
  ratio: string
  duration: number
}

export interface AssistantContext {
  idea?: string
  genre?: Genre
  shot?: AssistantShot
  characters?: { name: string; identity: string; personality: string }[]
}

export interface AssistantReply {
  /** 给用户看的回答，中文，60 字以内 */
  reply: string
  applyTarget: AssistantTarget
  /** applyTarget 不是 none 时，改写后的完整文本 */
  newText: string
}

export const MAX_QUESTION = 300

/** 提问校验：太短说明没说清，太长说明在写小作文 */
export function readQuestion(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length < 2) throw new Error('请先把问题说清楚，比如「这一镜雨再大一点」')
  if (text.length > MAX_QUESTION) throw new Error(`问题太长了，请控制在 ${MAX_QUESTION} 字以内`)
  return text
}

/** 把项目与当前镜头拼成上下文；镜头缺字段时如实标注，不替模型脑补 */
export function buildAssistantPrompt(question: string, ctx: AssistantContext) {
  const genreClause =
    ctx.genre && ctx.genre.hint ? `\n题材风格：${ctx.genre.label}（${ctx.genre.hint}）` : ''

  const cast = (ctx.characters ?? [])
    .slice(0, 8)
    .map((c) => `- ${c.name}：${c.identity}；${c.personality}`)
    .join('\n')

  const shot = ctx.shot
  const shotBlock = shot
    ? `## 当前镜头（用户正在改的就是这一镜，别改别的）
镜号：${shot.shot}
场景：${shot.scene || '（未填）'}
画幅：${shot.ratio}｜时长：${shot.duration}s
景别：${shot.shotSize || '中景'}｜运镜：${shot.camera}
出场角色：${shot.characters.join('、') || '（未填）'}
动作：${shot.action || '（未填）'}
英文提示词：${shot.prompt || '（还没写）'}`
    : `## 当前镜头
（用户还没选中镜头，只能基于故事想法回答，applyTarget 必须是 none）`

  const system = [
    '你是一位短剧的执行导演兼分镜师，负责把用户对画面的要求变成能直接落地的修改。',
    '',
    '## 纪律',
    '1. 只输出一个 JSON 对象，不要解释、不要 markdown 围栏',
    '2. reply 用简体中文，直接给结论，60 字以内，不要说「好的」「当然可以」这类客套',
    '3. applyTarget 三选一：',
    '   - prompt：用户改的是画面本身（光线/构图/景别/氛围/动作细节）→ newText 给改写后的完整英文提示词，必须逐字保留原文里的角色锚点（CHEN MO 这类大写英文名）与画幅、画质后缀',
    '   - action：用户只改剧情动作、且不需要动提示词 → newText 给改写后的中文动作描述',
    '   - none：用户在提问、让你解释、或信息不够 → newText 给空串',
    '4. 一次只解决用户提的那一件事，不要顺手改别的字段，不要重写大纲',
    '5. 缺信息就别猜：把缺什么说清楚，applyTarget 用 none',
    '6. 不要输出 null',
    '',
    '## JSON 模板',
    '{',
    '  "reply": "中文回答，60 字以内",',
    '  "applyTarget": "prompt",',
    '  "newText": "applyTarget 为 prompt/action 时的完整改写文本，否则空串"',
    '}',
  ].join('\n')

  const user = `## 项目
一句话想法：${ctx.idea?.trim() || '（未填）'}${genreClause}
${cast ? `\n## 角色锚点\n${cast}\n` : ''}
${shotBlock}

## 用户的提问
${question}`

  return { system, user }
}

const TARGETS: AssistantTarget[] = ['prompt', 'action', 'none']

/**
 * 兜底解析：模型偶尔把字段名写成 answer/text/advice，
 * 也会在 applyTarget 为 none 时仍塞一段 newText——后者必须丢掉，
 * 否则界面会拿一段解释去覆盖提示词，把用户的镜头改坏。
 */
export function parseAssistantReply(raw: unknown): AssistantReply {
  if (typeof raw === 'string') {
    return { reply: raw.trim().slice(0, 200), applyTarget: 'none', newText: '' }
  }
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const reply = String(src.reply ?? src.answer ?? src.text ?? src.advice ?? '').trim().slice(0, 200)
  const targetRaw = String(src.applyTarget ?? src.target ?? 'none').trim()
  const target = (TARGETS as string[]).includes(targetRaw) ? (targetRaw as AssistantTarget) : 'none'
  const newText = String(src.newText ?? src.new_text ?? src.candidate ?? '').trim().slice(0, 2000)
  const applyTarget: AssistantTarget = newText && target !== 'none' ? target : 'none'
  return {
    reply: reply || (applyTarget === 'none' ? '没想出怎么改，换个说法再问我一次' : '改好了，点下面的按钮应用'),
    applyTarget,
    newText: applyTarget === 'none' ? '' : newText,
  }
}
