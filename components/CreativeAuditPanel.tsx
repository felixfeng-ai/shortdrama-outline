'use client'

import type { CreativeAuditResult } from '@/lib/creative-audit'
import SmoothCollapse from './SmoothCollapse'

interface Props {
  open: boolean
  result: CreativeAuditResult
}

const AREA_LABEL: Record<CreativeAuditResult['issues'][number]['area'], string> = {
  characters: '人物',
  episodes: '分集',
  contract: '创作契约',
  pacing: '节奏',
}

export default function CreativeAuditPanel({ open, result }: Props) {
  return (
    <SmoothCollapse open={open} className="brief">
      <div className="brief-body creative-audit-panel">
        <p className="text-[11px] text-ink-400">
          本地确定性检查 · {result.counts.error} 个错误 · {result.counts.warning} 个提醒
        </p>
        {result.issues.length === 0 ? (
          <p className="text-[11.5px] text-ink-500">
            没有发现确定性问题。这不代表作品一定优质，只表示当前规则没有命中。
          </p>
        ) : (
          <ul className="grid gap-2">
            {result.issues.slice(0, 20).map((issue, index) => (
              <li
                key={`${issue.code}-${issue.episode ?? issue.character ?? index}`}
                className={`grid gap-1 rounded-chip border px-3 py-2 ${
                  issue.severity === 'error'
                    ? 'border-accent-300 bg-accent-50/40'
                    : 'border-surface-line bg-surface-soft'
                }`}
              >
                <span className="text-[11px] font-medium text-ink-400">
                  {issue.severity === 'error' ? '需修正' : '提醒'}
                  {' · '}{AREA_LABEL[issue.area]}
                  {issue.character ? ` · ${issue.character}` : ''}
                  {issue.episode ? ` · 第 ${issue.episode} 集` : ''}
                </span>
                <strong className="text-[12px] font-medium text-ink-800">{issue.title}</strong>
                <span className="text-[11.5px] leading-relaxed text-ink-600">
                  证据：{issue.evidence}
                </span>
                <span className="text-[11.5px] leading-relaxed text-ink-500">
                  建议：{issue.suggestion}
                </span>
              </li>
            ))}
          </ul>
        )}
        {result.issues.length > 20 && (
          <p className="text-[11px] text-ink-400">另有 {result.issues.length - 20} 条未展开。</p>
        )}
      </div>
    </SmoothCollapse>
  )
}
