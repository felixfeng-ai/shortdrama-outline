'use client'

import type { ProjectDecisionDto } from '@/lib/assets/api'
import SmoothCollapse from './SmoothCollapse'

interface Props {
  open: boolean
  entries: ProjectDecisionDto[]
}

const STATUS_LABEL: Record<ProjectDecisionDto['status'], string> = {
  proposed: '待决定',
  accepted: '已接受',
  rejected: '已否决',
  locked: '已锁定',
}

export default function DecisionPanel({ open, entries }: Props) {
  return (
    <SmoothCollapse open={open} className="brief">
      <div className="brief-body">
        {entries.length === 0 ? (
          <p className="text-[11.5px] text-ink-400">
            还没有结构化决策。可以让 AI 场记提出一条待确认决策。
          </p>
        ) : (
          <ul className="grid gap-2">
            {entries.slice(0, 12).map((entry) => (
              <li
                key={entry.id}
                className="grid gap-1 rounded-chip border border-surface-line bg-surface-soft px-3 py-2"
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <strong className="truncate text-[12px] text-ink-800">
                    {entry.question}
                  </strong>
                  <span className="shrink-0 text-[10px] text-ink-400">
                    {STATUS_LABEL[entry.status]}
                    {entry.locked ? ' · 锁定' : ''}
                  </span>
                </div>
                <span className="text-[11.5px] text-ink-700">
                  {entry.chosenValue ? `选择：${entry.chosenValue}` : '尚未选择'}
                </span>
                {entry.reason && (
                  <span className="text-[10.5px] leading-relaxed text-ink-400">
                    {entry.reason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SmoothCollapse>
  )
}
