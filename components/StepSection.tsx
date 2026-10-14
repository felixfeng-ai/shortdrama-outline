'use client'

import type { ReactNode } from 'react'
import Skeleton from './Skeleton'
import type { StepKey, StepStatus } from '@/lib/types'

interface Props {
  index: number
  title: string
  subtitle: string
  status: StepStatus
  error: string | null
  /** 是否已经有生成结果 */
  hasContent: boolean
  /** 前置条件未满足时锁住，不能点生成（第二步起是上一步没做完，第一步是还没输入想法） */
  locked: boolean
  /** 锁住时显示的提示，例如「请先生成核心人物」 */
  lockedHint: string
  /** 按钮文案，例如「生成人物」 */
  actionLabel: string
  onGenerate: () => void
  skeletonVariant: 'characters' | 'acts' | 'episodes'
  children: ReactNode
  /** 结果区右上角的额外操作，例如「添加角色」 */
  extraAction?: ReactNode
  /** 左侧导航点击后滚到这里 */
  anchorId?: string
  /** 创作层（朱砂）/ 资产层（青竹）——决定这一步的强调色 */
  layer?: 'story' | 'asset'
  /**
   * 是否显示这一步。一页只放当前步骤（点左栏切换），
   * 传 false 时整段不渲染——它不是被藏起来，而是真的不在 DOM 里。
   */
  visible?: boolean
}

/**
 * 六步共用的外壳：编号 + 标题 + 操作按钮 + 状态相关的内容区
 * （未开始 / 加载中 / 流式接收中 / 出错 / 有结果）。把状态分支收敛在这里，
 * 页面组件就干净了。
 *
 * 视觉上是一张「稿纸」：顶部一道细线 + 衬线编号，而不是大圆角卡片 + 圆形徽标。
 * 强调色按 layer 走——朱砂=给人看的文本，青竹=给机器的提示词，
 * 这条颜色规则贯穿全站，用户不需要记，看两次就形成了。
 */
export default function StepSection({
  index,
  title,
  subtitle,
  status,
  error,
  hasContent,
  locked,
  lockedHint,
  actionLabel,
  onGenerate,
  skeletonVariant,
  children,
  extraAction,
  anchorId,
  layer = 'story',
  visible = true,
}: Props) {
  if (!visible) return null

  const isLoading = status === 'loading'
  // 流式期间内容正在一批批到达：按钮该显示「生成中…」并禁用，
  // 但已经拿到的部分必须立刻渲染，不能再压着骨架屏
  const isStreaming = status === 'streaming'
  const isBusy = isLoading || isStreaming
  const disabled = isBusy || locked

  const isAsset = layer === 'asset'

  /** 未开始 / 被锁住时的占位：虚线方框换成「稿纸上的空行」 */
  const placeholder = (
    <div className="rounded-chip border border-dashed border-surface-line bg-surface/60 px-4 py-10 text-center">
      <p className="text-sm text-ink-400">{lockedHint}</p>
    </div>
  )

  return (
    <section
      id={anchorId}
      className="surface scroll-mt-4 p-4 sm:p-6"
      // 生成过程不换页，读屏用户需要被主动告知状态变化
      aria-busy={isBusy}
    >
      {/* 头部 */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-surface-line pb-3.5">
        <div className="flex min-w-0 items-baseline gap-3">
          {/* 衬线编号：像稿纸边上手写的序号，替代原来的圆角徽标 */}
          {/* 资产层（定妆/场次/分镜）用暖赭编号，和创作层区分；两层的按钮同色，强调色只有一个 */}
          <span className={`folio shrink-0 ${hasContent ? (isAsset ? 'text-done-600' : '') : 'text-ink-300'}`}>
            {index}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hasContent && extraAction}
          <button
            type="button"
            onClick={onGenerate}
            disabled={disabled}
            className="btn-primary rounded-chip px-3.5 py-2 text-sm font-medium
              focus:outline-none focus:ring-2 focus:ring-accent-300 focus:ring-offset-1
              focus:ring-offset-surface-card"
          >
            {isBusy && (
              <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {isBusy ? '生成中…' : hasContent ? `重新${actionLabel}` : actionLabel}
          </button>
        </div>
      </header>

      {/* 内容区 */}
      <div aria-live="polite">
        {/* AI 生成中：半透明浅红流光条，替代原来只有按钮转圈的静默等待 */}
        {isBusy && (
          <div className="ai-status mb-3.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-500" />
            AI 生成中 · {isStreaming ? '正在逐条返回' : '正在思考'}…
          </div>
        )}
        {locked && !hasContent ? (
          placeholder
        ) : isLoading || (isStreaming && !hasContent) ? (
          // streaming 且还没有任何内容时才出骨架屏；一有内容就走下面的分支
          <Skeleton variant={skeletonVariant} />
        ) : (
          <>
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-chip border border-accent-200 bg-accent-50 px-3.5 py-3">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-accent-500"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-11a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                    clipRule="evenodd"
                  />
                </svg>
                <p role="alert" className="text-sm leading-relaxed text-accent-800">
                  {error}
                </p>
              </div>
            )}

            {hasContent ? (
              <div className="animate-fade-in-up">{children}</div>
            ) : (
              !error && placeholder
            )}
          </>
        )}
      </div>
    </section>
  )
}
