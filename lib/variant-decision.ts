export type VariantStrategy = 'contract' | 'conflict'
export type VariantChoiceStep = 'characters' | 'acts' | 'episodes'

export interface VariantChoiceOption {
  id: 'A' | 'B'
  strategy: VariantStrategy
  summary: string
}

export interface VariantDecisionInput {
  step: VariantChoiceStep
  targetType: 'variant'
  targetId: VariantChoiceStep
  question: string
  options: string[]
  chosenValue: string
  reason: string
  status: 'accepted'
  impact: string[]
}

export interface VariantMemoryDecision {
  step: string
  question: string
  options: string[]
  chosenValue: string
  reason: string
  status: string
}

export interface VariantMemoryJudgment {
  step: string
  action: string
  reason: string
  decisionId: string | null
}

const LABELS: Record<VariantStrategy, string> = {
  contract: '稳守契约',
  conflict: '强化冲突',
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, max)
    : ''
}

export function readVariantStrategy(value: unknown): VariantStrategy {
  return value === 'conflict' ? 'conflict' : 'contract'
}

export function variantStrategyLabel(value: VariantStrategy): string {
  return LABELS[value]
}

export function variantPromptBlock(value: VariantStrategy): string {
  const directive = value === 'conflict'
    ? '强化对抗、代价与不可逆选择；可以更冒险，但不能改变故事承诺，也不能越过创作契约里的红线。'
    : '优先动机完整、因果清楚与结构稳定；不要为了反转牺牲人物可信度，也不要扩大故事承诺。'
  return `\n\n## 本版方向（${variantStrategyLabel(value)}）\n${directive}`
}

export function buildVariantDecisionInput(input: {
  step: VariantChoiceStep
  stepLabel: string
  chosen: 'A' | 'B'
  options: VariantChoiceOption[]
  reason?: string
}): VariantDecisionInput {
  const options = input.options.map((option) =>
    `${option.id} · ${variantStrategyLabel(option.strategy)} · ${clean(option.summary, 120)}`
  )
  const chosenOption = input.options.find((option) => option.id === input.chosen)
  if (!chosenOption) throw new Error('选中的版本不在候选中')
  const chosenValue = options[input.options.indexOf(chosenOption)]
  return {
    step: input.step,
    targetType: 'variant',
    targetId: input.step,
    question: `${clean(input.stepLabel, 40)}：选择哪一版？`,
    options,
    chosenValue,
    reason: clean(input.reason, 120),
    status: 'accepted',
    impact: [input.step],
  }
}

const RELATED_STEPS: Record<VariantChoiceStep, string[]> = {
  characters: ['characters'],
  acts: ['characters', 'acts'],
  episodes: ['characters', 'acts', 'episodes'],
}

export function buildVariantMemoryBlock(
  currentStep: VariantChoiceStep,
  decisions: VariantMemoryDecision[],
  judgments: VariantMemoryJudgment[],
): string {
  const related = new Set(RELATED_STEPS[currentStep])
  const decisionLines = decisions
    .filter((item) =>
      related.has(item.step)
      && (item.status === 'accepted' || item.status === 'locked')
    )
    .map((item) => {
      const rejected = item.options
        .filter((option) => option !== item.chosenValue)
        .slice(0, 2)
        .join(' / ')
      const reason = clean(item.reason, 100)
      return clean(
        `选择「${item.chosenValue}」${rejected ? `；未选：${rejected}` : ''}${reason ? `；理由：${reason}` : ''}`,
        180,
      )
    })
  const judgmentLines = judgments
    .filter((item) => related.has(item.step) && !item.decisionId)
    .map((item) => clean(
      `${item.action}${item.reason ? `；理由：${item.reason}` : ''}`,
      160,
    ))
  const lines = [...decisionLines, ...judgmentLines].filter(Boolean).slice(0, 5)
  if (lines.length === 0) return ''
  return `\n\n## 最近的创作判断（不要重复用户已经否决的方向）\n${lines
    .map((line) => `- ${line}`)
    .join('\n')}`
}
