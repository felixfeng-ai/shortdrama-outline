// 项目待办：把散在六个分区里的状态收成一张清单。
//
// 为什么需要它：六步改成一次只看一步之后，用户看得见「当前这一步」，
// 看不见「整个项目还有哪些没处理」——缺参考图、提示词掉锚点、自己标了返修，
// 原本要一屏一屏翻才发现，翻不到就以为没事。
//
// 纪律：这个模块只读不写。它告诉你该做什么、去哪儿做，绝不自己动手改任何东西——
// 一旦它能写，六步各自的「重新生成」就不再是唯一的改动入口，版本与血缘会乱。
import type { StepKey } from './types'
import { reviewShots } from './project-status.ts'

export interface TodoShot {
  shot: number
  /** 缺参考图的角色名 */
  missingRefFor: string[]
  /** 返修雷达上的状态：todo / done / rework */
  status: string
}

export interface TodoInput {
  /** 六步完成态，和左栏导航共用同一份 */
  completed: Record<StepKey, boolean>
  shots: TodoShot[]
  /** 提示词缺了当前角色锚点的镜头数（来自 auditShots 的对账） */
  expiredShots: number
  /** 是否已经输入过故事想法（没有的话第一条引导说的是「先写想法」） */
  hasIdea?: boolean
}

export interface TodoItem {
  id: 'start' | 'next' | 'expired-shots' | 'missing-refs' | 'rework-shots'
  /** 一句话说清要做什么 */
  text: string
  /** 去哪儿处理 */
  step: StepKey
  /** next = 还没做的下一步；fix = 已经产出但有问题的 */
  kind: 'next' | 'fix'
}

/** 主链顺序：定妆是资产层的旁路，不算「下一步」，它的缺失以「缺参考图」的形式出现 */
const MAIN_CHAIN: { key: StepKey; nav: string }[] = [
  { key: 'characters', nav: '核心人物' },
  { key: 'acts', nav: '三幕大纲' },
  { key: 'episodes', nav: '分集剧情' },
  { key: 'scenes', nav: '场景' },
  { key: 'shots', nav: '分镜' },
]

/**
 * 生成待办清单。顺序固定：先「下一步」（该做什么），再「要修的」（按严重度排）。
 * 严重度口径：掉锚点 > 缺参考图 > 需返修——
 * 掉锚点是提示词本身错了（拿去出图会串脸），缺参考图是素材没到位，返修是用户自己的进度标记。
 */
export function buildTodoList(input: TodoInput): TodoItem[] {
  const items: TodoItem[] = []

  // 主链全做完时就不推「下一步」了，这张清单只剩要修的问题
  const nextStep = MAIN_CHAIN.find((s) => !input.completed[s.key])
  if (nextStep) {
    const notStarted = !input.hasIdea && nextStep.key === 'characters'
    items.push(
      notStarted
        ? {
            id: 'start',
            text: '还没有开始：先在「故事灵感」里写下想法，再点「生成 · 核心人物」',
            step: 'characters',
            kind: 'next',
          }
        : { id: 'next', text: `下一步：生成${nextStep.nav}`, step: nextStep.key, kind: 'next' },
    )
  }

  // 提示词掉锚点：分镜已经产出了，但当前的定妆锚点没进提示词
  if (input.expiredShots > 0) {
    items.push({
      id: 'expired-shots',
      text: `有 ${input.expiredShots} 个镜头的提示词缺了当前角色锚点，需要重新生成分镜`,
      step: 'shots',
      kind: 'fix',
    })
  }

  // 缺参考图：把涉及的镜头号与角色名列出来，光说「有 2 个」用户还得自己找
  const shotReview = reviewShots(input.shots, input.expiredShots)
  const missing = shotReview.missing
  if (missing.length > 0) {
    const names = [...new Set(missing.flatMap((s) => s.missingRefFor))]
    const shotNos = missing.map((s) => `第 ${s.shot} 镜`).slice(0, 4).join('、')
    items.push({
      id: 'missing-refs',
      text: `有 ${missing.length} 个镜头缺参考图（${shotNos}）：${names.join('、')} —— 去定妆给他们挂图`,
      step: 'visuals',
      kind: 'fix',
    })
  }

  const rework = shotReview.rework
  if (rework.length > 0) {
    const shotNos = rework.map((s) => `第 ${s.shot} 镜`).slice(0, 4).join('、')
    items.push({
      id: 'rework-shots',
      text: `有 ${rework.length} 个镜头标了「需返修」（${shotNos}）`,
      step: 'shots',
      kind: 'fix',
    })
  }

  return items
}
