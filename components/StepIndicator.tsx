import { STEPS, type StepKey } from '@/lib/types'

interface Props {
  /** 当前进行到第几步（1-6） */
  current: number
  /** 每一步是否已经产出内容 */
  completed: Record<StepKey, boolean>
}

/** 顶部步骤条：已完成打勾，进行中高亮，未开始置灰 */
export default function StepIndicator({ current, completed }: Props) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:gap-2">
      {STEPS.map((step, i) => {
        const isDone = completed[step.key]
        const isCurrent = !isDone && step.index === current
        // 资产层（定妆/场次/分镜）用更淡的一档：它产出的是给出图工具的提示词，
        // 不是给编剧看的文本，视觉上区分开能让人一眼看出流程分两段
        const isAsset = step.layer === 'asset'

        return (
          <li key={step.key} className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {/* 序号 / 对勾 */}
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors
                  ${
                    isDone
                      ? isAsset
                        ? 'border-emerald-400 bg-emerald-400 text-white'
                        : 'border-brand-500 bg-brand-500 text-white'
                      : isCurrent
                        ? 'border-brand-400 bg-white text-brand-600 ring-4 ring-brand-100'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
              >
                {isDone ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
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

              {/* 文案：窄屏用两字标签，宽屏才出完整标题——六步平铺放不下完整标题 */}
              <span
                className={`whitespace-nowrap text-xs font-medium sm:text-sm ${
                  isDone || isCurrent ? 'text-slate-800' : 'text-slate-400'
                }`}
              >
                <span className="sm:hidden">{step.short}</span>
                <span className="hidden sm:inline">{step.title}</span>
              </span>
            </div>

            {/* 连接线 */}
            {i < STEPS.length - 1 && (
              <span
                className={`h-px w-3 shrink-0 rounded sm:w-5 ${
                  isDone ? 'bg-brand-300' : 'bg-slate-200'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
