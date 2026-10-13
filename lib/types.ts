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

/**
 * 六个步骤的标识。
 *
 * 为什么必须有六个值：之前只有三个，后三步（定妆/场次/分镜）只能借用
 * 前三个的状态槽，导致「点视觉定妆，第一步的按钮变成加载中」这种串台。
 * 状态槽和执行步骤必须一一对应，否则这类 bug 会反复出现。
 */
export type StepKey =
  | 'characters' | 'acts' | 'episodes'
  | 'visuals' | 'scenes' | 'shots'

/**
 * 每个步骤的运行状态，界面靠它切换按钮/骨架屏/错误提示。
 *
 * loading 与 streaming 的区别：loading 是「还没有任何内容可显示」，只出骨架屏；
 * streaming 是「内容正在一批批到达」，已经拿到的部分要立刻显示出来。
 * 目前只有第三步分集用 streaming。
 */
export type StepStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

/**
 * 一句话想法的长度限制。
 *
 * 界面拿它禁用按钮、限制输入框，接口拿它做入参校验——必须是同一份，
 * 否则会出现「按钮亮着，一点却报错」这种自相矛盾的状态。
 */
export const MIN_IDEA_LENGTH = 4
export const MAX_IDEA_LENGTH = 500

/**
 * 六步的元信息，步骤条和分区标题共用一份，避免文案散落各处。
 * short 是移动端步骤条用的两字标签：窄屏放不下完整标题，但也不该只剩第一步有字。
 *
 * 前三个是「创作层」（给编剧看的文本），后三个是「资产层」（给出图工具的提示词）。
 * 两层都进步骤条——不然用户走到第四步时会以为流程已经结束。
 * layer 用来在步骤条上区分两层，视觉上给资产层一个更淡的处理。
 */
export const STEPS: {
  key: StepKey
  index: number
  title: string
  short: string
  subtitle: string
  /** 创作层产出给人看的文本，资产层产出给出图工具的提示词 */
  layer: 'story' | 'asset'
}[] = [
  { key: 'characters', index: 1, title: '生成核心人物', short: '人物', subtitle: '3-5 个有动机、有冲突的角色', layer: 'story' },
  { key: 'acts', index: 2, title: '生成三幕大纲', short: '三幕', subtitle: '铺垫 → 冲突 → 结局', layer: 'story' },
  { key: 'episodes', index: 3, title: '生成分集剧情', short: '分集', subtitle: '10 集，每集结尾留钩子', layer: 'story' },
  { key: 'visuals', index: 4, title: '角色视觉定妆', short: '定妆', subtitle: '把角色变成可复用的视觉锚点', layer: 'asset' },
  { key: 'scenes', index: 5, title: '生成场次剧本', short: '场次', subtitle: '一场戏 = 一个连续时空', layer: 'asset' },
  { key: 'shots', index: 6, title: '生成分镜', short: '分镜', subtitle: '每镜带角色锚点与参考图', layer: 'asset' },
]

/** 三幕的固定结构，模型没返回 title 时用它兜底 */
export const ACT_META: Record<ActKey, { label: string; hint: string; accent: string }> = {
  setup: { label: '第一幕 · 铺垫', hint: '开端 + 背景', accent: 'sky' },
  conflict: { label: '第二幕 · 冲突', hint: '发展 + 升级', accent: 'amber' },
  resolution: { label: '第三幕 · 结局', hint: '高潮 + 收束', accent: 'rose' },
}
