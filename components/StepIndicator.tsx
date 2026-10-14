import { STEPS, type StepKey } from '@/lib/types'

interface Props {
  /** 当前进行到第几步（1-6） */
  current: number
  /** 每一步是否已经产出内容 */
  completed: Record<StepKey, boolean>
}

/**
 * 顶部步骤条：已完成打勾，进行中高亮，未开始置灰。
 *
 * 六步在窄屏一定是横滑的，与其让用户自己发现，不如把「这是两段流程」
 * 直接写在上面：前三步决定故事是什么，后三步决定画面怎么出。
 */
export default function StepIndicator({ current, completed }: Props) {
  // 分两段渲染，中间插一个断点，比单纯六步平铺更能说明流程结构
  const creative = STEPS.filter((s) => s.layer !== 'asset')
  const asset = STEPS.filter((s) => s.layer === 'asset')

  const renderStep = (step: (typeof STEPS)[number], isFirst: boolean) => {
    const isDone = completed[step.key]
    const isCurrent = !isDone && step.index === current
    const isAsset = step.layer === 'asset'

    return (
      <li key={step.key} className="flex shrink-0 items-center">
        {/* 前半段的连接线；分段处由下面的竖线分隔取代 */}
        {!isFirst && (
          <span
            aria-hidden="true"
            className={`mx-1 h-px w-3 shrink-0 rounded sm:mx-1.5 sm:w-5 ${
              isDone ? 'bg-brand-300' : 'bg-slate-200'
            }`}
          />
        )}

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors
              ${
                isDone
                  ? isAsset
                    ? 'border-emerald-400 bg-emerald-400 text-white'
                    : 'border-brand-500 bg-brand-500 text-white'
                  : isCurrent
                    ? `border-brand-400 bg-white text-brand-600 ring-4 ${
                        isAsset ? 'ring-emerald-100' : 'ring-brand-100'
                      }`
                    : 'border-slate-200 bg-white text-slate-400'
              }`}
          >
            {isDone ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
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
      </li>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <ol className="flex min-w-0 items-center overflow-x-auto pb-1">
        {creative.map((step, i) => renderStep(step, i === 0))}
      </ol>

      {/* 分段断点：把「写故事」和「出画面」切开 */}
      <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-slate-200 sm:block" />

      <ol className="flex min-w-0 items-center overflow-x-auto pb-1">
        {asset.map((step, i) => renderStep(step, i === 0))}
      </ol>
    </div>
  )
}
