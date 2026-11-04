import type { SkillDefinition } from './catalog'
import { SKILL_CATALOG } from './catalog'
import {
  assessSkillReadiness,
  type IntakeMode,
  type IntakeProjectState,
  type SkillReadiness,
} from './intake'

export interface SkillPlanStep {
  id: string
  title: string
  input: string
  output: string
}

export interface SkillExecutionPlan {
  skillId: string
  objective: string
  context: string[]
  steps: SkillPlanStep[]
  units: {
    min: number
    max: number
    label: string
  }
  timeLabel: string
  confirmations: string[]
  recovery: string
  outputPreview: string[]
  maxModelCalls: number
  writes: boolean
}

export interface SkillRecommendation {
  skill: SkillDefinition
  reason: string
  readiness: SkillReadiness
}

interface BuildPlanInput {
  state: IntakeProjectState
  projectTitle?: string
  briefReady?: boolean
}

interface RecommendInput {
  mode: IntakeMode
  state: IntakeProjectState
  query?: string
}

const MODEL_CALL_LIMITS: Record<string, number> = {
  adaptation: 6,
  'story-doctor': 3,
  canon: 4,
  continuity: 0,
  delivery: 0,
  cost: 0,
}

const PLAN_STEPS: Record<string, SkillPlanStep[]> = {
  adaptation: [
    {
      id: 'index-source',
      title: '定位原文与改编边界',
      input: '原文目录、章节长度、创作契约',
      output: '章节索引、人物关系、改编风险',
    },
    {
      id: 'build-bible',
      title: '建立原著圣经',
      input: '章节索引、人物关系、已锁定事实',
      output: '人物、地点、时间线与不可改事实',
    },
    {
      id: 'plan-episodes',
      title: '规划分集与钩子',
      input: '原著圣经、目标集数、创作契约',
      output: '分集计划、每集冲突与结尾钩子',
    },
    {
      id: 'confirm-write',
      title: '确认后写入项目',
      input: '改编计划与新增/修改清单',
      output: '用户确认后的项目版本',
    },
  ],
  'story-doctor': [
    {
      id: 'read-story',
      title: '读取分集与三幕',
      input: '三幕大纲、分集剧情、创作契约',
      output: '当前结构摘要',
    },
    {
      id: 'find-risks',
      title: '检查钩子、节奏与动机',
      input: '结构摘要、已有判断记录',
      output: '按集定位的问题清单',
    },
    {
      id: 'rank-risks',
      title: '按影响排序',
      input: '问题清单、目标受众与情绪',
      output: '优先修订建议与理由',
    },
    {
      id: 'review',
      title: '等待用户选择修改',
      input: '修订建议',
      output: '待确认方案，不改正文',
    },
  ],
  canon: [
    {
      id: 'read-canon',
      title: '读取人物与已有事实',
      input: '人物、视觉、场次、分镜和已锁定 Canon',
      output: '实体与事实索引',
    },
    {
      id: 'rule-check',
      title: '运行确定性硬冲突检查',
      input: '实体事实、关系和时间线',
      output: '可直接定位的硬冲突',
    },
    {
      id: 'semantic-check',
      title: '补充语义冲突检查',
      input: '硬冲突结果、相关正文片段',
      output: '可疑冲突与证据',
    },
    {
      id: 'propose',
      title: '生成修改提议',
      input: '冲突证据',
      output: '待确认提议，不自动改正文',
    },
  ],
  continuity: [
    {
      id: 'read-shots',
      title: '读取最新分镜链路',
      input: '分镜、定妆、地点图和生成图台账',
      output: '逐镜生产状态',
    },
    {
      id: 'check-continuity',
      title: '检查锚点与首尾帧',
      input: '逐镜提示词、角色锚点、参考图版本',
      output: '缺锚点、缺图与版本错位',
    },
    {
      id: 'build-queue',
      title: '建立返修队列',
      input: '问题镜头与严重度',
      output: '按集、场、镜定位的返修队列',
    },
    {
      id: 'report',
      title: '输出只读报告',
      input: '返修队列',
      output: '可跳转工作台处理的连续性报告',
    },
  ],
  delivery: [
    {
      id: 'read-delivery',
      title: '读取交付资产',
      input: '分镜、角色与地点参考图、目标平台',
      output: '交付检查快照',
    },
    {
      id: 'run-preflight',
      title: '运行平台规则预检',
      input: '时长、画幅、锚点与缺失文件',
      output: '阻断项与提醒项',
    },
    {
      id: 'group-issues',
      title: '按镜头归组问题',
      input: '预检问题清单',
      output: '按集、场、镜定位的处理队列',
    },
    {
      id: 'report',
      title: '输出只读预检报告',
      input: '问题队列',
      output: '平台交付预检报告',
    },
  ],
  cost: [
    {
      id: 'read-cost',
      title: '读取镜头成本因子',
      input: '镜头时长、参考图数量、动作复杂度',
      output: '逐镜成本因子',
    },
    {
      id: 'estimate',
      title: '运行成本模型',
      input: '逐镜成本因子、当前成本口径',
      output: '逐镜与整剧预计成本',
    },
    {
      id: 'plan-batches',
      title: '规划更省的批次',
      input: '高风险镜头、参考图复用机会',
      output: '批次顺序与优化建议',
    },
    {
      id: 'report',
      title: '输出成本报告',
      input: '成本与批次建议',
      output: '只读成本规划报告',
    },
  ],
}

const OUTPUT_PREVIEW: Record<string, (input: BuildPlanInput) => string[]> = {
  adaptation: () => [
    '原著圣经：人物、地点、时间线与不可改事实',
    '分集计划：每集冲突、转折与结尾钩子',
    '待确认写入清单：新增与修改分开列出',
  ],
  'story-doctor': (input) => [
    input.state.episodes > 0 ? `${input.state.episodes} 集钩子与节奏诊断` : '三幕结构诊断',
    '按集定位的追看风险',
    '可逐条采纳的修订建议',
  ],
  canon: () => [
    '人物、时间线与道具状态冲突',
    '每条冲突的证据与影响范围',
    '待确认的修改提议',
  ],
  continuity: (input) => [
    `检查 ${input.state.shots} 镜的锚点与参考图`,
    '按集、场、镜定位的问题队列',
    '可跳转工作台的返修动作',
  ],
  delivery: (input) => [
    `检查 ${input.state.shots} 镜的平台交付规格`,
    '阻断项与提醒项分开输出',
    '逐镜处理位置与交付缺口',
  ],
  cost: (input) => [
    input.state.shots > 0 ? `${input.state.shots} 镜预计成本` : '当前分集规模成本',
    '高风险镜头与参考图超量费',
    '更省的批次顺序',
  ],
}

function modelLimit(skillId: string): number {
  return MODEL_CALL_LIMITS[skillId] ?? 6
}

export function maxModelCallsForSkill(skillId: string): number {
  return modelLimit(skillId)
}

function timeLabel(maxCalls: number): string {
  if (maxCalls === 0) return '通常 < 1 秒（纯计算）'
  if (maxCalls <= 3) return '预计约 20-45 秒'
  if (maxCalls <= 4) return '预计约 30-60 秒'
  return '预计约 30-90 秒，原文越长越慢'
}

function buildContext(input: BuildPlanInput): string[] {
  const context = [
    input.projectTitle ? `项目：${input.projectTitle}` : '项目：尚未选择项目',
  ]
  if (input.state.materialCount > 0) context.push(`已读取 ${input.state.materialCount} 份原文`)
  if (input.briefReady) context.push('创作契约：已填写')
  if (input.state.episodes > 0) context.push(`分集：${input.state.episodes} 集`)
  if (input.state.shots > 0) context.push(`分镜：${input.state.shots} 镜`)
  if (input.state.characters > 0) context.push(`人物：${input.state.characters} 个`)
  if (context.length === 1) context.push('任务输入：本页当前草稿')
  return context
}

export function buildSkillExecutionPlan(
  skill: SkillDefinition,
  input: BuildPlanInput,
): SkillExecutionPlan {
  const limits = modelLimit(skill.id)
  const writes = skill.id === 'adaptation'
  const preview = OUTPUT_PREVIEW[skill.id]?.(input) ?? skill.produces
  return {
    skillId: skill.id,
    objective: skill.summary,
    context: buildContext(input),
    steps: PLAN_STEPS[skill.id] ?? [
      {
        id: 'read',
        title: '读取当前上下文',
        input: skill.requires.join('、') || '当前项目输入',
        output: skill.produces.join('、'),
      },
      {
        id: 'execute',
        title: `执行${skill.title}`,
        input: '项目上下文与本页任务',
        output: skill.produces.join('、'),
      },
      {
        id: 'review',
        title: '用户确认',
        input: '执行结果与影响范围',
        output: writes ? '确认后的项目版本' : '只读结果',
      },
    ],
    units: {
      min: limits > 0 ? 1 : 0,
      max: limits,
      label: limits > 0 ? `最多 ${limits} 额度（1 单位/模型往返）` : '0 额度',
    },
    timeLabel: timeLabel(limits),
    confirmations: writes
      ? [
        '执行前确认 Skill、输入范围与目标集数',
        '写入项目或替换现有内容前确认新增与修改清单',
      ]
      : [
        '只读执行，不写入项目',
        '采纳具体修改前仍需进入工作台逐条确认',
      ],
    recovery: limits === 0
      ? '纯计算失败可直接重新运行；不会留下半写入版本。'
      : '同一页面内可继续追问；刷新页面后需重新发起，已确认写入的内容不会自动回滚。',
    outputPreview: preview,
    maxModelCalls: limits,
    writes,
  }
}

function scoreSkill(
  skill: SkillDefinition,
  input: RecommendInput,
): number {
  const state = input.state
  let score = 0
  if (skill.id === 'adaptation') {
    if (input.mode === 'source') score += 50
    if (state.materialCount > 0) score += 35
    if (input.mode === 'idea') score += 10
    if (state.materialCount === 0 && input.mode !== 'source') score -= 25
  } else if (skill.id === 'story-doctor') {
    if (input.mode === 'idea') score += 40
    if (input.mode === 'project') score += 20
    if (state.episodes > 0) score += 25
    if (state.acts > 0) score += 15
    if (state.hasIdea) score += 5
  } else if (skill.id === 'canon') {
    if (input.mode === 'project') score += 20
    if (state.characters > 0) score += 20
    if (state.visuals > 0) score += 15
    if (state.scenes > 0) score += 15
    if (state.shots > 0) score += 5
  } else if (skill.id === 'continuity') {
    if (state.shots > 0) score += 70
    if (input.mode === 'project') score += 20
    if (state.scenes > 0) score += 10
  } else if (skill.id === 'delivery') {
    if (state.shots > 0) score += 60
    if (input.mode === 'project') score += 15
  } else if (skill.id === 'cost') {
    if (state.shots > 0) score += 35
    if (state.episodes > 0) score += 25
    if (input.mode === 'project') score += 10
  }
  const query = input.query?.trim().toLowerCase()
  if (query && `${skill.title} ${skill.summary} ${skill.category}`.toLowerCase().includes(query)) {
    score += 30
  }
  return score
}

function recommendationReason(skill: SkillDefinition, state: IntakeProjectState): string {
  if (skill.id === 'adaptation') {
    return state.materialCount > 0
      ? `已有 ${state.materialCount} 份原文，先建立可追溯的改编底稿`
      : '从当前输入开始整理可改编的章节与人物关系'
  }
  if (skill.id === 'story-doctor') {
    return state.episodes > 0
      ? `已有 ${state.episodes} 集，先检查钩子、节奏和追看风险`
      : '先把故事冲突与节奏整理成可执行判断'
  }
  if (skill.id === 'canon') {
    return state.characters > 0
      ? `已有 ${state.characters} 个人物，适合核对关系、时间线与道具状态`
      : '先检查人物、地点和时间线是否会前后矛盾'
  }
  if (skill.id === 'continuity') {
    return state.shots > 0
      ? `已有 ${state.shots} 镜，可先建立逐镜返修队列`
      : '生成分镜后可直接检查首尾帧、锚点与参考图版本'
  }
  if (skill.id === 'delivery') {
    return state.shots > 0
      ? `已有 ${state.shots} 镜，可按即梦/可灵规格检查阻断项`
      : '生成分镜后按目标平台规格检查交付缺口'
  }
  return state.shots > 0
    ? `按现有 ${state.shots} 镜估算成本与更省的批次顺序`
    : '按当前集数估算生成成本与批次风险'
}

export function recommendSkillsForProject(input: RecommendInput): SkillRecommendation[] {
  return SKILL_CATALOG
    .map((skill) => ({
      skill,
      score: scoreSkill(skill, input),
      readiness: assessSkillReadiness(skill.id, input.state),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      if (left.readiness.ready !== right.readiness.ready) return left.readiness.ready ? -1 : 1
      return left.skill.title.localeCompare(right.skill.title, 'zh-CN')
    })
    .slice(0, 3)
    .map(({ skill, readiness }) => ({
      skill,
      readiness,
      reason: recommendationReason(skill, input.state),
    }))
}
