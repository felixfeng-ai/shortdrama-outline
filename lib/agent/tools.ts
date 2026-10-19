// 场记的工具层（见 AGENT.md §4）。
//
// 两条纪律写在这里，而不是靠调用方自觉：
//   1. 只读工具只读——它拿到的是一份**状态快照**，改不到真东西；
//   2. 能"写"的只有 propose_*，它们只返回一张待确认卡片（AgentCard），
//      落库由用户点确认后走既有链路完成。这是版本与血缘不被打散的保障。
import type { StepKey } from '../types'
import type { CreativeBrief } from '../brief'
import type { JudgmentEntry } from '../judgment-log'
import { isFlatPacing, pacingHint, pacingSeries } from '../pacing'

export interface AgentShot {
  shot: number
  scene: string
  characters: string[]
  missingRefFor: string[]
  status: string
  shotSize: string
  camera: string
  prompt: string
  speaker: string
  dialogue: string
}

export interface AgentState {
  projectTitle: string
  hasIdea: boolean
  brief: CreativeBrief
  judgments: JudgmentEntry[]
  episodes: { number: number; title: string; hook: string; intensity?: number }[]
  completed: Record<StepKey, boolean>
  shots: AgentShot[]
  expiredShots: number
  quota: { remaining: number; limit: number; projectsLeft: number } | null
}

export type AgentCard =
  | { kind: 'shot-edit'; shot: number; target: 'prompt' | 'action'; text: string; summary: string }
  | { kind: 'regenerate'; step: StepKey; stepLabel: string; reason: string }

export interface ToolResult {
  ok: boolean
  /** 给模型看的压缩短句（不是原始 JSON） */
  content: string
  /** propose 工具产出的待确认卡片；只读工具不产 */
  card?: AgentCard
}

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

const STEP_LABEL: Record<StepKey, string> = {
  characters: '核心人物',
  acts: '三幕大纲',
  episodes: '分集剧情',
  visuals: '视觉定妆',
  scenes: '场景',
  shots: '分镜',
}

/** 给模型看的工具说明书。schema 是纯数据，前后端都能用（服务端只需它） */
export const AGENT_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'get_project_status',
    description: '查当前项目的六步进度（哪一步做了、哪一步没做）。用户问「还有哪些要处理」「做到哪了」时先调它。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'audit_shots',
    description: '查分镜的健康状况：共几镜、几镜缺参考图（含镜号与角色名）、几镜提示词掉了角色锚点、几镜标了返修。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'review_episodes',
    description: '只读审片：检查分集的钩子是否缺失/过短，以及整体节奏曲线是否是一条平线。回答「这一版好不好」时用，不要直接改内容。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_quota',
    description: '查今日剩余额度，以及还能跑几个完整项目。用户问「还能用几次」时调用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_docs',
    description: '在这款工具自己的说明文档里检索：怎么导出、怎么拿到出图平台生成视频、怎么批量出定妆图、首尾帧怎么衔接、额度怎么算、图存在哪。回答操作类问题必须先查它，并引用出处。',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: '用户的原话或改写后的问题' } },
      required: ['question'],
    },
  },
  {
    name: 'propose_shot_edit',
    description: '提议改写某一镜的提示词或动作。**只生成待确认卡片，不会直接修改**。改画面（光线/构图/氛围/景别）用 target=prompt；只改剧情动作用 target=action。',
    parameters: {
      type: 'object',
      properties: {
        shot: { type: 'number', description: '镜号（必须是当前项目里真实存在的镜号）' },
        target: { type: 'string', enum: ['prompt', 'action'] },
        newText: { type: 'string', description: '改写后的完整文本（prompt 用英文，action 用中文）' },
        summary: { type: 'string', description: '一句话说明改了什么，给用户确认时看' },
      },
      required: ['shot', 'target', 'newText'],
    },
  },
  {
    name: 'propose_regenerate',
    description: '建议重新生成某一步（比如「三幕大纲太平」「分集钩子太弱」）。**只生成待确认卡片，不会直接触发生成**。',
    parameters: {
      type: 'object',
      properties: {
        step: { type: 'string', enum: ['characters', 'acts', 'episodes', 'visuals', 'scenes', 'shots'] },
        reason: { type: 'string', description: '为什么建议重跑，一句话' },
      },
      required: ['step', 'reason'],
    },
  },
]

// ── 文档片段（search_docs 的语料）──
//
// v1 用人工整理的片段而不是全仓检索：创作者要的是「怎么做」，不是「哪一行写了什么」。
// 每条都带出处，模型回答时必须引用它——没有出处的操作建议对用户等于噪音。
const DOC_SNIPPETS: { source: string; title: string; text: string; keys: string[] }[] = [
  {
    source: 'README.md#打包带走',
    title: '把产物带到出图平台',
    text: '「打包带走」导出的 zip 里含 project.json、prompts.csv（逐镜提示词）、shotlist.txt（逐镜执行清单）、chaining.txt（首尾帧衔接）、storyboard.html（离线分镜表）。逐镜执行：把提示词复制到出图平台，按「参考图」一栏准备图片；需要衔接的两镜，用上一镜成片的末帧当下一镜首帧。',
    // 关键词要挑「有信息量」的：像「怎么」「拿」这种泛词会让任何问题都命中，
    // 检索就退化成"永远返回第一条"
    keys: ['导出', '打包', '平台', '即梦', '可灵', '视频', '生成', '提示词', 'zip', '产物'],
  },
  {
    source: 'AGENT.md#分镜视觉',
    title: '首尾帧衔接怎么做',
    text: '在镜卡上勾「接下一镜首帧」，分镜工具条就会出现「复制衔接清单」：列出尾帧该导出成什么名字、下一镜的提示词是什么。出图平台选首尾帧模式，上传首帧与尾帧两张图，中间过渡由模型补。',
    keys: ['衔接', '首尾帧', '尾帧', '首帧', '视频', '过渡', '连续'],
  },
  {
    source: 'README.md#批量出图',
    title: '批量出定妆图',
    text: '定妆面板的批量出图工具箱：母版里写 〖变量〗，变量值按角色逐行填。出图平台支持模板变量时一次提交出完全部定妆图；不支持时用「复制全部提示词」逐个出。',
    keys: ['批量', '定妆', '母版', '变量', '一次', '出图'],
  },
  {
    source: 'README.md#三条硬指标',
    title: '图存在哪',
    text: '图片全程留在你本机（Chrome/Edge 用目录直连，其他浏览器用本地库），服务端只记「哪张图属于谁」与指纹，不提供上传通道。',
    keys: ['图', '上传', '隐私', '本地', '安全', '存'],
  },
  {
    source: 'README.md#额度',
    title: '额度怎么算',
    text: '跑完一条完整流程（六步）花 13 单位；默认每个身份每天 65 单位，约 5 个完整项目。关键词联想与助手提问各算 1 单位。额度按北京时间每天恢复。',
    keys: ['额度', '收费', '多少', '限制', '次数', '钱', '成本'],
  },
  {
    source: 'README.md#六步工作流',
    title: '六步怎么走',
    text: '核心人物 → 三幕大纲 → 分集剧情 → 视觉定妆 → 场景 → 分镜提示词。每一步都能单独重跑；改了上游，下游会被标成「需重新生成」，确认后才更新。',
    keys: ['六步', '流程', '步骤', '顺序'],
  },
]

/** 关键词命中打分：命中越多、越靠前越相关。纯函数，方便单测 */
export function searchDocs(question: string): { source: string; title: string; text: string }[] {
  const q = question.toLowerCase()
  return DOC_SNIPPETS
    .map((d) => ({ d, score: d.keys.reduce((n, k) => (q.includes(k.toLowerCase()) ? n + 1 : n), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => ({ source: x.d.source, title: x.d.title, text: x.d.text }))
}

/** 把状态快照变成一组执行器。快照是只读入参——执行器改不到真东西 */
export function createToolExecutors(state: AgentState): Record<string, (args: Record<string, unknown>) => ToolResult> {
  const stepLine = (Object.keys(STEP_LABEL) as StepKey[])
    .map((k) => `${STEP_LABEL[k]}${state.completed[k] ? '✓' : '✗'}`)
    .join(' ')

  return {
    get_project_status: () => {
      const b = state.brief
      const briefLine = [b.emotion, b.audience, b.references].filter(Boolean).length > 0 || b.redline
        ? `创作意图：${[b.emotion, b.audience, b.references].filter(Boolean).join(' · ') || '（未填情绪/观众）'}${b.redline ? `；不要变成：${b.redline}` : ''}`
        : ''
      const logLine = state.judgments.length > 0
        ? `最近的判断：${state.judgments
            .slice(-3)
            .map((j) => `${j.action}${j.reason ? `（${j.reason}）` : ''}`)
            .join('；')}`
        : ''
      return {
        ok: true,
        content: [
          `项目『${state.projectTitle || '未命名'}』：${stepLine}。分镜共 ${state.shots.length} 镜。`,
          briefLine,
          logLine,
        ].filter(Boolean).join('\n'),
      }
    },

    audit_shots: () => {
      if (state.shots.length === 0) {
        return { ok: true, content: '还没有分镜，所以没有可审计的镜头。' }
      }
      const missing = state.shots.filter((s) => s.missingRefFor.length > 0)
      const names = [...new Set(missing.flatMap((s) => s.missingRefFor))]
      const rework = state.shots.filter((s) => s.status === 'rework')
      const parts = [`分镜共 ${state.shots.length} 镜`]
      parts.push(
        missing.length > 0
          ? `${missing.length} 个镜头缺参考图（${missing.map((s) => `第 ${s.shot} 镜`).slice(0, 4).join('、')}｜${names.join('、')}）`
          : '参考图都齐',
      )
      parts.push(state.expiredShots > 0 ? `${state.expiredShots} 个镜头的提示词缺了当前锚点，需要重新生成分镜` : '提示词锚点都对得上')
      parts.push(rework.length > 0 ? `${rework.length} 个镜头标了需返修` : '没有标返修的镜头')
      return { ok: true, content: parts.join('；') + '。' }
    },

    review_episodes: () => {
      const eps = state.episodes
      if (eps.length === 0) {
        return { ok: true, content: '还没有分集，暂时没有可审的内容。' }
      }
      const empty = eps.filter((e) => !e.hook.trim())
      const short = eps.filter((e) => e.hook.trim() && e.hook.trim().length < 20)
      const series = pacingSeries(eps)
      const parts = [`共 ${eps.length} 集`]
      if (empty.length > 0) {
        parts.push(`${empty.length} 集没有钩子（第 ${empty.map((e) => e.number).slice(0, 5).join('、')} 集）`)
      }
      if (short.length > 0) {
        parts.push(`${short.length} 集钩子少于 20 字（第 ${short.map((e) => e.number).slice(0, 5).join('、')} 集）`)
      }
      parts.push(isFlatPacing(series) ? '强度几乎是一条平线，中段容易掉' : pacingHint(series))
      return { ok: true, content: parts.filter(Boolean).join('；') + '。' }
    },

    get_quota: () => {
      if (!state.quota) return { ok: false, content: '额度信息暂时读不到（接口没返回）。' }
      return {
        ok: true,
        content: `今日剩余 ${state.quota.remaining}/${state.quota.limit} 单位，按 10 集/部估算还能跑 ${state.quota.projectsLeft} 部；集数越多，每部消耗的批次额度越高。`,
      }
    },

    search_docs: (args) => {
      const question = String(args?.question ?? '')
      const hits = searchDocs(question)
      if (hits.length === 0) {
        return { ok: true, content: '没有找到相关说明。可以换个说法，或者看 README 的「用法」一节。' }
      }
      return {
        ok: true,
        content: hits.map((h, i) => `${i + 1}. ${h.title}：${h.text}\n   出处：${h.source}`).join('\n'),
      }
    },

    propose_shot_edit: (args) => {
      const shotNo = Number(args?.shot)
      const target = String(args?.target ?? '')
      const newText = String(args?.newText ?? '').trim()
      if (!state.shots.some((s) => s.shot === shotNo)) {
        return { ok: false, content: `没有第 ${shotNo} 镜（当前项目共 ${state.shots.length} 镜），不要编镜号。` }
      }
      if (target !== 'prompt' && target !== 'action') {
        return { ok: false, content: 'target 只能是 prompt 或 action。' }
      }
      if (!newText) return { ok: false, content: '改写后的文本不能为空。' }
      const summary = String(args?.summary ?? '').trim() || (target === 'prompt' ? '改写本镜提示词' : '改写本镜动作')
      return {
        ok: true,
        content: `已生成待确认卡片：第 ${shotNo} 镜 · ${summary}（用户点确认后才会写入，我没有直接改）`,
        card: { kind: 'shot-edit', shot: shotNo, target, text: newText, summary },
      }
    },

    propose_regenerate: (args) => {
      const step = String(args?.step ?? '')
      const reason = String(args?.reason ?? '').trim()
      if (!(step in STEP_LABEL)) {
        return { ok: false, content: 'step 必须是六步之一：characters / acts / episodes / visuals / scenes / shots。' }
      }
      if (!reason) return { ok: false, content: '要说明为什么建议重跑（reason 不能为空）。' }
      return {
        ok: true,
        content: `已生成待确认卡片：建议重新生成「${STEP_LABEL[step as StepKey]}」——${reason}（用户点确认后才会触发）`,
        card: { kind: 'regenerate', step: step as StepKey, stepLabel: STEP_LABEL[step as StepKey], reason },
      }
    },
  }
}
