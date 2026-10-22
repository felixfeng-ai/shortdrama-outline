'use client'

import type { StepKey } from '@/lib/types'
import { STEPS } from '@/lib/types'

interface Props {
  current: number
  completed: Record<StepKey, boolean>
  onJump: (key: StepKey) => void
  canJump: (key: StepKey) => boolean
  todoCount: number
  shotDone: number
  shotTotal: number
}

const RECENT_KEYS: StepKey[] = ['characters', 'visuals', 'scenes']

export default function SignalOverview({
  current,
  completed,
  onJump,
  canJump,
  todoCount,
  shotDone,
  shotTotal,
}: Props) {
  const currentStep = STEPS.find((step) => step.index === current)

  const stateFor = (step: (typeof STEPS)[number]) => {
    if (completed[step.key]) return '已生成'
    if (current === step.index) return '进行中'
    return '待开始'
  }

  return (
    <section className="signal-overview" aria-label="项目总览">
      <nav className="signal-flow" aria-label="六步工作流">
        {STEPS.map((step) => {
          const isCurrent = current === step.index
          const isDone = completed[step.key]
          const reachable = isDone || isCurrent || canJump(step.key)
          return (
            <button
              key={step.key}
              type="button"
              className={isCurrent ? 'now' : isDone ? 'done' : ''}
              onClick={() => reachable && onJump(step.key)}
              disabled={!reachable}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`${step.index}. ${step.nav}`}
            >
              {step.short}
            </button>
          )
        })}
      </nav>

      <div className="signal-pulse-grid">
        <article className="signal-pulse-card">
          <h3>项目脉搏</h3>
          <dl>
            <div><dt>待办</dt><dd>{todoCount} 项</dd></div>
            <div><dt>分镜</dt><dd>{shotDone} / {shotTotal}</dd></div>
            <div><dt>当前</dt><dd>{currentStep?.short ?? '人物'}</dd></div>
          </dl>
        </article>
        <article className="signal-pulse-card">
          <h3>最近动作</h3>
          <dl>
            {RECENT_KEYS.map((key) => {
              const step = STEPS.find((item) => item.key === key)
              if (!step) return null
              return <div key={key}><dt>{step.short}</dt><dd>{stateFor(step)}</dd></div>
            })}
          </dl>
        </article>
      </div>
    </section>
  )
}
