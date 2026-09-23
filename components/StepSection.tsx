'use client'

import type { ReactNode } from 'react'
import Skeleton from './Skeleton'
import type { StepStatus } from '@/lib/types'

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
}

/**
 * 三个步骤共用的外壳：编号 + 标题 + 操作按钮 + 状态相关的内容区
 * （未开始 / 加载中 / 流式接收中 / 出错 / 有结果）。把状态分支收敛在这里，
 * 页面组件就干净了。
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
}: Props) {
  const isLoading = status === 'loading'
  // 流式期间内容正在一批批到达：按钮该显示「生成中…」并禁用，
  // 但已经拿到的部分必须立刻渲染，不能再压着骨架屏
  const isStreaming = status === 'streaming'
  const isBusy = isLoading || isStreaming
  const disabled = isBusy || locked

  /** 未开始 / 被锁住时的灰色虚线占位 */
  const placeholder = (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
      <p className="text-sm text-slate-500">{lockedHint}</p>
    </div>
  )

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur-sm sm:p-6"
      // 生成过程不换页，读屏用户需要被主动告知状态变化
      aria-busy={isBusy}
    >
      {/* 头部 */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold
              ${hasContent ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}
          >
            {index}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasContent && extraAction}
          <button
            type="button"
            onClick={onGenerate}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white
              transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-300
              disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
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
        {locked && !hasContent ? (
          placeholder
        ) : isLoading || (isStreaming && !hasContent) ? (
          // streaming 且还没有任何内容时才出骨架屏；一有内容就走下面的分支
          <Skeleton variant={skeletonVariant} />
        ) : (
          <>
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-rose-500"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-11a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                    clipRule="evenodd"
                  />
                </svg>
                <p role="alert" className="text-sm leading-relaxed text-rose-700">
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
