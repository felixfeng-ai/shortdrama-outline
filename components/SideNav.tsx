'use client'

import { STEPS, type StepKey } from '@/lib/types'

interface Props {
  /** 当前进行到第几步（1-6） */
  current: number
  /** 每一步是否已经产出内容 */
  completed: Record<StepKey, boolean>
  /** 点某一步：滚到对应分区。已完成/当前步可点，未解锁的步不可点 */
  onJump: (key: StepKey) => void
  /** 是否可以跳到某一步（前置已完成） */
  canJump: (key: StepKey) => boolean
}

/**
 * 左侧导航：把六步按「创作 / 资产」两层切开。
 *
 * 两层的颜色分工是产品结构本身——朱砂=写故事，青竹=出画面，
 * 用户在左栏一眼就知道自己在哪一层，不需要读文字。
 */
export default function SideNav({ current, completed, onJump, canJump }: Props) {
  const story = STEPS.filter((s) => s.layer === 'story')
  const asset = STEPS.filter((s) => s.layer === 'asset')

  const renderItem = (step: (typeof STEPS)[number]) => {
    const isDone = completed[step.key]
    const isCurrent = !isDone && step.index === current
    const isAsset = step.layer === 'asset'
    const reachable = isDone || isCurrent || canJump(step.key)

    // 当前步用实心色块，已完成用描边，两者都不靠文字区分
    const dot = isDone
      ? isAsset
        ? 'border-done-500 bg-done-500 text-white'
        : 'border-accent-500 bg-accent-500 text-white'
      : isCurrent
        ? isAsset
          ? 'border-done-600 bg-done-50 text-done-700'
          : 'border-accent-600 bg-accent-50 text-accent-700'
        : 'border-ink-200 bg-surface-card text-ink-400'

    return (
      <li key={step.key}>
        <button
          type="button"
          onClick={() => reachable && onJump(step.key)}
          disabled={!reachable}
          aria-current={isCurrent ? 'step' : undefined}
          className={`group relative flex w-full items-center gap-2.5 rounded-chip px-2.5 py-2 text-left transition-colors
            ${isCurrent ? 'bg-accent-100' : 'hover:bg-surface-deep/60'}
            ${reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}
        >
          {/* 当前步：浅玫底 + 左侧朱砂竖条（参考图的选中态） */}
          {isCurrent && (
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-full bg-accent-700" />
          )}
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${dot}`}
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
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-sm ${isCurrent ? 'font-semibold text-ink-900' : 'text-ink-600'}`}
            >
              {step.title}
            </span>
            <span className="block truncate text-[11px] text-ink-400">{step.subtitle}</span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <nav aria-label="创作流程" className="space-y-5">
      <div>
        <p className="mb-2 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-accent-700">
          <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-accent-500" />
          创作 · 写故事
        </p>
        <ul className="space-y-0.5">{story.map(renderItem)}</ul>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-done-700">
          <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-done-500" />
          资产 · 出画面
        </p>
        <ul className="space-y-0.5">{asset.map(renderItem)}</ul>
      </div>
    </nav>
  )
}
