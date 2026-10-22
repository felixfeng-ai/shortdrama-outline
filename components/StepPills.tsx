'use client'

// H 双舱的顶部步骤条：等宽序号 + 名称，横向一排。
// 取代原来的左侧竖栏——竖栏占掉 13rem，切到双舱后这段宽度要还给工作面。
import type { StepKey } from '@/lib/types'
import { STEPS } from '@/lib/types'

interface Props {
  current: number
  completed: Record<StepKey, boolean>
  onJump: (key: StepKey) => void
  canJump: (key: StepKey) => boolean
}

export default function StepPills({ current, completed, onJump, canJump }: Props) {
  return (
    <nav aria-label="创作流程" className="h-pills">
      {STEPS.map((step) => {
        const isCurrent = step.index === current
        const isDone = completed[step.key]
        const reachable = isDone || isCurrent || canJump(step.key)
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => reachable && onJump(step.key)}
            disabled={!reachable}
            aria-current={isCurrent ? 'step' : undefined}
            aria-label={`${step.index}. ${step.nav}`}
            title={step.subtitle}
            className={`h-pill ${isCurrent ? 'on' : ''} ${isDone && !isCurrent ? 'done' : ''}`}
          >
            <em>{String(step.index).padStart(2, '0')}</em>
            <span className="pill-full">{step.nav}</span>
            <span className="pill-short">{step.short}</span>
            {isDone && !isCurrent && <span className="h-pill-dot" aria-hidden="true" />}
          </button>
        )
      })}
    </nav>
  )
}
