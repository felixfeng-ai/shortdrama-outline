'use client'

import { STEPS, type StepKey } from '@/lib/types'

interface Props {
  current: number
  completed: Record<StepKey, boolean>
  onJump: (key: StepKey) => void
}

/**
 * 窄屏步骤条（<lg）。
 *
 * 桌面端六步在左侧固定导航里，窄屏放不下左栏，就折成顶部一条横向可滑的进度条。
 * 不是把左栏藏起来——用户必须始终能看到「我在六步里的哪一步、还剩几步」。
 * 两段（创作/资产）之间插一道竖线，轴线换了但分层信息不能丢。
 */
export default function StepIndicator({ current, completed, onJump }: Props) {
  const story = STEPS.filter((s) => s.layer === 'story')
  const asset = STEPS.filter((s) => s.layer === 'asset')

  const renderStep = (step: (typeof STEPS)[number]) => {
    const isDone = completed[step.key]
    const isCurrent = !isDone && step.index === current
    const isAsset = step.layer === 'asset'

    const tone = isDone
      ? isAsset
        ? 'border-done-500 bg-done-500 text-white'
        : 'border-accent-500 bg-accent-500 text-white'
      : isCurrent
        ? isAsset
          ? 'border-done-600 bg-done-50 text-done-700 ring-2 ring-done-200'
          : 'border-accent-600 bg-accent-50 text-accent-700 ring-2 ring-accent-200'
        : 'border-ink-200 bg-surface-card text-ink-400'

    return (
      <li key={step.key} className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => onJump(step.key)}
          aria-current={isCurrent ? 'step' : undefined}
          className="flex shrink-0 items-center gap-1.5"
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${tone}`}
          >
            {isDone ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              step.index
            )}
          </span>
          <span
            className={`whitespace-nowrap text-xs ${isDone || isCurrent ? 'font-medium text-ink-800' : 'text-ink-400'}`}
          >
            {step.short}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="flex items-center gap-2.5">
      <ol className="flex min-w-0 items-center gap-2.5 overflow-x-auto pb-1">
        {story.map(renderStep)}
      </ol>

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-surface-line" />

      <ol className="flex min-w-0 items-center gap-2.5 overflow-x-auto pb-1">
        {asset.map(renderStep)}
      </ol>
    </div>
  )
}
