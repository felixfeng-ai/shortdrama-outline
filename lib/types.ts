// 全站共享的数据结构。前端状态和后端返回值都用这里的类型，避免两边对不上。

/** 核心人物 */
export interface Character {
  id: string
  name: string // 姓名
  identity: string // 身份
  personality: string // 性格
  motivation: string // 核心动机
  arc: string // 人物弧光
}

/** 三幕中的一幕 */
export interface Act {
  id: string
  /** 幕的固定标识，前端用来上色 */
  key: ActKey
  title: string // 幕名，如「铺垫」
  summary: string // 这一幕发生了什么
  beats: string[] // 情节点
}

export type ActKey = 'setup' | 'conflict' | 'resolution'

/** 分集剧情 */
export interface Episode {
  id: string
  number: number // 集数
  title: string // 标题
  synopsis: string // 剧情梗概
  hook: string // 结尾钩子
}

/** 三个步骤的标识 */
export type StepKey = 'characters' | 'acts' | 'episodes'

/** 每个步骤的运行状态，界面靠它切换按钮/骨架屏/错误提示 */
export type StepStatus = 'idle' | 'loading' | 'done' | 'error'

/** 三步的元信息，步骤条和分区标题共用一份，避免文案散落各处 */
export const STEPS: { key: StepKey; index: number; title: string; subtitle: string }[] = [
  { key: 'characters', index: 1, title: '生成核心人物', subtitle: '3-5 个有动机、有冲突的角色' },
  { key: 'acts', index: 2, title: '生成三幕大纲', subtitle: '铺垫 → 冲突 → 结局' },
  { key: 'episodes', index: 3, title: '生成分集剧情', subtitle: '10 集，每集结尾留钩子' },
]

/** 三幕的固定结构，模型没返回 title 时用它兜底 */
export const ACT_META: Record<ActKey, { label: string; hint: string; accent: string }> = {
  setup: { label: '第一幕 · 铺垫', hint: '开端 + 背景', accent: 'sky' },
  conflict: { label: '第二幕 · 冲突', hint: '发展 + 升级', accent: 'amber' },
  resolution: { label: '第三幕 · 结局', hint: '高潮 + 收束', accent: 'rose' },
}
