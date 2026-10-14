'use client'

// 版本与联动面板：护城河时刻的界面。
//
// 两件事：
//   1. 显示下游是否过期（基于血缘，不是内容 hash）
//   2. 显示「改一处影响了多少个镜头」，并提供显式的批量更新
//
// 关键设计：批量更新必须是用户显式点击的动作，绝不隐式回写（SDD D2）。
import { useState } from 'react'

interface Props {
  /** 本版是基于旧上游生成的 */
  stale: boolean
  staleReason: string | null
  /** 受影响的镜头数（由 /api/impact 算出） */
  affectedShots: number
  /** 其中提示词已过期的镜头数 */
  expiredShots: number
  onRebuild: () => void
  actionLabel: string
}

export default function VersionBar({
  stale, staleReason, affectedShots, expiredShots, onRebuild, actionLabel,
}: Props) {
  const [open, setOpen] = useState(false)

  if (!stale && affectedShots === 0) return null

  return (
    <div className="mb-4 rounded-card border border-accent-200 bg-accent-50/70 px-3.5 py-3">
      <div className="flex items-start gap-2">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-500">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
        </svg>

        <div className="min-w-0 flex-1">
          {stale && (
            <p className="text-sm leading-relaxed text-accent-900">
              {staleReason ?? '上游内容已改动'}，当前结果基于旧版本生成。
              <span className="ml-1 text-accent-700">已生成的内容不会被自动清空。</span>
            </p>
          )}

          {affectedShots > 0 && (
            <p className="mt-1 text-xs leading-relaxed text-accent-800">
              本次改动影响 <strong>{affectedShots}</strong> 个下游结果
              {expiredShots > 0 && <>，其中 <strong>{expiredShots}</strong> 个镜头的提示词已过期</>}。
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRebuild}
              className="rounded-chip bg-accent-600 px-3 py-1.5 text-xs font-medium text-white
                transition-colors hover:bg-accent-700"
            >
              重新{actionLabel}
            </button>

            {affectedShots > 0 && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="rounded-chip border border-accent-300 bg-surface-card px-3 py-1.5 text-xs font-medium text-accent-800
                  transition-colors hover:bg-accent-50"
              >
                {open ? '收起影响明细' : '查看影响明细'}
              </button>
            )}
          </div>

          {open && (
            <p className="mt-2 rounded-chip bg-surface-card/70 px-2.5 py-2 text-xs text-accent-900">
              批量更新是显式操作：点击后才会重算受影响的提示词，
              并产生一个新的版本（旧版本仍可回溯）。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
