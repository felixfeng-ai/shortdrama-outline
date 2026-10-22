'use client'

// 左侧六步导航（对齐 concept-reference.png 的左栏）。
//
// 造形规则：图标 + 标题 + 一句说明；当前步是「浅玫底 + 左侧朱砂竖条」，
// 已完成的步在图标右上角点一颗朱砂勾，未解锁的整条压暗。
// 不再用圆形数字徽标——参考图的左栏没有数字，靠图标与状态色区分。
import type { StepKey } from '@/lib/types'
import { STEPS } from '@/lib/types'

interface Props {
  /** 当前进行到第几步（1-6） */
  current: number
  /** 每一步是否已经产出内容 */
  completed: Record<StepKey, boolean>
  /** 点某一步：滚到对应分区 */
  onJump: (key: StepKey) => void
  /** 是否可以跳到某一步（前置已完成） */
  canJump: (key: StepKey) => boolean
}

/** 六步各自的线性图标（stroke 体系，与参考图的细线图标同一种手感） */
const ICONS: Record<StepKey, string> = {
  // 核心人物：名片里的人
  characters: 'M3 4.5h18v15H3z M9.6 10.4a1.9 1.9 0 1 1 3.8 0 1.9 1.9 0 0 1-3.8 0 M6.6 16.2c.8-1.6 1.8-2.3 3-2.3s2.2.7 3 2.3',
  // 三幕大纲：一块分幕板
  acts: 'M3 4.5h18v15H3 M7.6 9.4h8.8 M7.6 12.2h8.8 M7.6 15h5',
  // 分集剧情：带序号的清单
  episodes: 'M3 4.5h18v15H3 M9 9.4h7.4 M9 12.2h7.4 M9 15h4.6 M6.4 9.4h.02 M6.4 12.2h.02 M6.4 15h.02',
  // 定妆：一张脸
  visuals: 'M3 4.5h18v15H3 M9 10.5a1.7 1.7 0 1 1 3.4 0 1.7 1.7 0 0 1-3.4 0 M5.6 11.6c1.2 0 2 .6 2.6 1.6 M15.8 11.6c-1.2 0-2 .6-2.6 1.6',
  // 场景：一个时空
  scenes: 'M20.4 11.7c0 4-3.8 7.2-8.4 7.2-.9 0-1.9-.13-2.7-.38L4.4 20.4l1.2-3.2c-1.2-1.2-2-3.2-2-5.5 0-4 3.8-7.2 8.4-7.2s8.4 3.2 8.4 7.2z M9.4 11.6h.02 M14.6 11.6h.02',
  // 分镜：出画前的确认勾
  shots: 'M3 4.5h18v15H3 M8.2 12.1l2.5 2.5 5.2-5.4',
}

export default function SideNav({ current, completed, onJump, canJump }: Props) {
  const story = STEPS.filter((s) => s.layer === 'story')
  const asset = STEPS.filter((s) => s.layer === 'asset')

  const renderItem = (step: (typeof STEPS)[number]) => {
    const isDone = completed[step.key]
    /**
     * 高亮 = 「正在看哪一步」，跟有没有生成过无关。
     * 之前写成 !isDone && index === current，结果某一步一生成完高亮就消失，
     * 默认进来时那一步已经不亮了——用户看不出自己在哪儿。
     */
    const isCurrent = step.index === current
    const reachable = isDone || isCurrent || canJump(step.key)

    return (
      <li key={step.key}>
        <button
          type="button"
          onClick={() => reachable && onJump(step.key)}
          disabled={!reachable}
          title={step.nav}
          aria-label={step.nav}
          aria-current={isCurrent ? 'step' : undefined}
          className={`group relative flex w-full items-center gap-3 rounded-chip px-4 py-4 text-left
            transition-colors ${isCurrent ? 'on' : isDone ? 'done' : 'hover:bg-surface-deep/60'}
            ${reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}
        >
          <span className="shrink-0">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={`h-[21px] w-[21px] fill-none [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]
                ${isCurrent ? 'stroke-accent-700' : isDone ? 'stroke-done-600' : 'stroke-ink-500'}`}
            >
              <path d={ICONS[step.key]} />
            </svg>
          </span>

          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-[15.5px] ${
                isCurrent ? 'font-semibold text-accent-700' : isDone ? 'text-done-700' : 'text-ink-700'
              }`}
            >
              {step.short}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <nav aria-label="创作流程" className="navpanel">
      {/* 参考图的左栏就是一串图标 + 名称，不分段、不写说明 */}
      <ul className="space-y-1.5">
        {[...story, ...asset].map(renderItem)}
      </ul>
    </nav>
  )
}
