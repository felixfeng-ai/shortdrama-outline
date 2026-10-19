'use client'

// 项目待办面板：只读，不写。
//
// 一行摘要 + 可展开的清单。默认收起是有意的：这张卡在内容区最上面，
// 默认铺开会把「生成核心人物」那张卡往下推；摘要行已经写了最要紧的那一条。
import { useState } from 'react'
import type { TodoItem } from '@/lib/todo'
import type { StepKey } from '@/lib/types'

interface Props {
  items: TodoItem[]
  /** 跳到某一步去处理 */
  onGo: (step: StepKey) => void
  /** 由外部的 meta 条控制开合 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** 只渲染展开后的清单，不画自己的头部 */
  headless?: boolean
}

export default function TodoPanel({ items, onGo, open: controlled, onOpenChange, headless = false }: Props) {
  const [inner, setInner] = useState(false)
  const open = controlled ?? inner
  const setOpen = onOpenChange ?? setInner
  if (items.length === 0) return null

  const fixes = items.filter((i) => i.kind === 'fix').length
  const list = open ? (
    <ul className={headless ? 'workmeta-list' : 'mt-2.5 space-y-2 border-t border-surface-line pt-2.5'}>
      {items.map((item, i) => (
        <li key={item.id} className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              item.kind === 'next' ? 'bg-ink-300' : i === 0 ? 'bg-accent-500' : 'bg-accent-300'
            }`}
          />
          <span className="min-w-0 flex-1 text-xs leading-relaxed text-ink-700">{item.text}</span>
          <button
            type="button"
            onClick={() => onGo(item.step)}
            className="shrink-0 rounded-pill border border-surface-line px-2.5 py-1 text-[11px] text-ink-600
              transition-colors hover:border-accent-300 hover:text-accent-700"
          >
            去处理
          </button>
        </li>
      ))}
    </ul>
  ) : null

  if (headless) return list

  return (
    <div className="surface px-3.5 py-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <span className="shrink-0 rounded-chip bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
          待办
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-700">{items[0].text}</span>
        {items.length > 1 && (
          <span className="shrink-0 rounded-pill bg-surface-soft px-2 py-0.5 text-[10px] text-ink-500">
            {items.length} 项{fixes > 0 ? ` · ${fixes} 处要修` : ''}
          </span>
        )}
        <span className="shrink-0 text-[11px] text-ink-400">{open ? '收起' : '展开'}</span>
      </button>

      {list}
    </div>
  )
}
