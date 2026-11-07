"use client"

import { describeProductionAction } from "@/lib/production-actions"
import type { TodoItem } from "@/lib/todo"

interface Props {
  items: TodoItem[]
  onAction: (item: TodoItem) => void
}

/**
 * 总览里的可执行阻断区。
 * 只展示真实修复项并沿用待办优先级，不在这里重新计算项目状态。
 */
export default function ProductionActionCenter({ items, onAction }: Props) {
  const fixes = items.filter((item) => item.kind === "fix").slice(0, 3)
  if (fixes.length === 0) return null

  return (
    <section className="wfx-production-actions" aria-labelledby="wfx-production-actions-title">
      <header>
        <span>需要处理</span>
        <b id="wfx-production-actions-title">{fixes.length} 项可用于继续生产</b>
      </header>
      <div>
        {fixes.map((item) => {
          const action = describeProductionAction(item)
          return (
            <button
              key={`${item.id}-${item.step}`}
              type="button"
              onClick={() => onAction(item)}
            >
              <span>
                <b>{action.label}</b>
                <small>{item.text}</small>
              </span>
              <em>{action.directFix ? "直接修复" : "定位处理"}</em>
            </button>
          )
        })}
      </div>
    </section>
  )
}
