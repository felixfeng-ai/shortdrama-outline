'use client'

import type { ProjectCanonDto } from '@/lib/assets/api'
import SmoothCollapse from './SmoothCollapse'

interface Props {
  open: boolean
  canon: ProjectCanonDto
}

export default function CanonPanel({ open, canon }: Props) {
  const errors = canon.issues.filter((issue) => issue.severity === 'error')
  const warnings = canon.issues.filter((issue) => issue.severity === 'warning')
  return (
    <SmoothCollapse open={open} className="brief">
      <div className="brief-body">
        <p className="text-[11px] text-ink-400">
          Canon · {canon.entities.length} 个实体 · {canon.facts.length} 条事实 ·
          {' '}{errors.length} 个冲突 · {warnings.length} 个提醒
        </p>
        {canon.issues.length === 0 ? (
          <p className="text-[11.5px] text-ink-500">当前连续性事实没有发现冲突。</p>
        ) : (
          <ul className="grid gap-2">
            {canon.issues.slice(0, 12).map((issue, index) => (
              <li
                key={`${issue.code}-${issue.factIds.join('-')}-${index}`}
                className={`grid gap-1 rounded-chip border px-3 py-2 ${
                  issue.severity === 'error'
                    ? 'border-accent-300 bg-accent-50/40'
                    : 'border-surface-line bg-surface-soft'
                }`}
              >
                <span className="text-[10px] font-medium text-ink-400">
                  {issue.severity === 'error' ? '连续性冲突' : '连续性提醒'}
                  {' · '}{issue.entityName}{' · '}{issue.field}
                </span>
                <span className="text-[11.5px] leading-relaxed text-ink-700">
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SmoothCollapse>
  )
}
