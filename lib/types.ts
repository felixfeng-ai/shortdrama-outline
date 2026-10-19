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
  /** 情绪/冲突强度 1-5，由人判断；缺省按 3 处理 */
  intensity?: number
}

/**
 * 短剧风格。风格是「项目级」参数而不是一次性开关——
 * 它会被注入到人物/三幕/分集/场次/分镜的 prompt 里，
 * 否则会出现「选了情感类，三幕却往悬疑跑」这种割裂。
 *
 * id 用英文短词（进 prompt 更稳），label 是给用户看的中文。
 * 第一个选项表示不限——不强制选择，老用户不必多一次点击。
 */
export interface Genre {
  id: string
  label: string
  /** 一句话说明这个风格的叙事抓手，直接拼进 prompt */
  hint: string
}

export const GENRES: Genre[] = [
  { id: 'none', label: '不限', hint: '' },
  { id: 'urban', label: '都市', hint: '现代都市背景，冲突来自阶层落差、金钱压力与命运反转' },
  { id: 'romance', label: '情感', hint: '以情感关系为主线，冲突来自误会、错位与牺牲，情绪浓度要高' },
  { id: 'workplace', label: '职场', hint: '职场博弈背景，冲突来自权力、规则与人情，靠智斗推进' },
  { id: 'suspense', label: '悬疑', hint: '信息差驱动，冲突来自隐藏的真相，每集都要翻一层' },
  { id: 'family', label: '家庭', hint: '家庭伦理背景，冲突来自亲情绑架、代际矛盾与责任分配' },
  { id: 'revenge', label: '逆袭复仇', hint: '主角被打压到底后反击，冲突来自身份反转与打脸节奏' },
  { id: 'costume', label: '古装', hint: '古装年代背景，冲突来自门第、婚约与家族权势，服化道要国风质感' },
  { id: 'sweet', label: '甜宠', hint: '高频撒糖与身份差制造心动，冲突要轻、糖分要密，反派只用来衬托主角' },
  { id: 'rebirth', label: '重生穿越', hint: '主角带着前世记忆或现代见识重开一局，冲突来自信息差与命运改写' },
  { id: 'cultivation', label: '玄幻修仙', hint: '修仙或异能体系设定，冲突来自境界压制、资源争夺与宗门恩怨，画面偏漫剧' },
  { id: 'fantasy', label: '奇幻设定', hint: '带超现实规则设定的世界（系统/异能/末世），冲突来自规则约束与代价' },
]

/** 风格校验：非法值一律回落成 none，绝不因为前端传错就报错 */
export function readGenre(value: unknown): Genre {
  const id = typeof value === 'string' ? value : ''
  return GENRES.find((g) => g.id === id) ?? GENRES[0]
}

/** 关键词的长度上限。联想输入比一句话想法更短，上限收得更紧 */
export const MAX_KEYWORD_LENGTH = 40
/** 一次联想最多给几个候选，太多反而选不出来 */
export const MAX_IDEAS_PER_ROUND = 3

/** 联想出来的候选想法 */
export interface IdeaCandidate {
  /** 一句话想法，用户点了会直接填进输入框 */
  title: string
  /** 为什么这么想，给用户判断依据，不进下游 prompt */
  reason: string
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
  /** 完整标题，用在分区头部（带「生成」这类动作词） */
  title: string
  /** 左侧导航用的短标签：四个字以内，扫一眼就知道这一步干什么 */
  nav: string
  /** 窄屏步骤条用的最短标签（两个字） */
  short: string
  subtitle: string
  /** 创作层产出给人看的文本，资产层产出给出图工具的提示词 */
  layer: 'story' | 'asset'
}[] = [
  { key: 'characters', index: 1, title: '生成核心人物', nav: '核心人物', short: '人物', subtitle: '3-5 个有动机、有冲突的角色', layer: 'story' },
  { key: 'acts', index: 2, title: '生成三幕大纲', nav: '三幕大纲', short: '三幕', subtitle: '铺垫 → 冲突 → 结局', layer: 'story' },
  { key: 'episodes', index: 3, title: '生成分集剧情', nav: '分集剧情', short: '分集', subtitle: '按选定集数拆分，每集结尾留钩子', layer: 'story' },
  { key: 'visuals', index: 4, title: '角色视觉定妆', nav: '定妆', short: '定妆', subtitle: '把角色变成可复用的视觉锚点', layer: 'asset' },
  { key: 'scenes', index: 5, title: '生成场景', nav: '场景', short: '场景', subtitle: '一场戏 = 一个连续时空', layer: 'asset' },
  { key: 'shots', index: 6, title: '生成分镜', nav: '分镜', short: '分镜', subtitle: '每镜带角色锚点与参考图', layer: 'asset' },
]

/** 三幕的固定结构，模型没返回 title 时用它兜底 */
export const ACT_META: Record<ActKey, { label: string; hint: string; accent: string }> = {
  setup: { label: '第一幕 · 铺垫', hint: '开端 + 背景', accent: 'sky' },
  conflict: { label: '第二幕 · 冲突', hint: '发展 + 升级', accent: 'amber' },
  resolution: { label: '第三幕 · 结局', hint: '高潮 + 收束', accent: 'rose' },
}
