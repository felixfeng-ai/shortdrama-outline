'use client'

import type { ComplianceAuditResult } from '@/lib/compliance'
import SmoothCollapse from './SmoothCollapse'

interface Props {
  open: boolean
  result: ComplianceAuditResult
}

export default function CompliancePanel({ open, result }: Props) {
  return (
    <SmoothCollapse open={open} className="brief">
      <div className="brief-body compliance-panel">
        <div className="rounded-chip border border-done-300 bg-done-50 px-3 py-2">
          <p className="text-[11px] font-medium text-done-900">导出 AI 标识已启用</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
            项目包、分镜 HTML、Markdown、CSV 与平台执行单会写入「{result.disclosure.label}」，
            并保留 {result.disclosure.provenancePath} 来源清单。
          </p>
        </div>

        <p className="text-[11px] text-ink-400">
          本地规则预检 · {result.counts.warning} 项需复核 · {result.counts.info} 项授权提醒
        </p>

        {result.issues.length === 0 ? (
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            未发现明确高风险词命中。这不等于内容合规通过，仍需人工审核与平台复核。
          </p>
        ) : (
          <ul className="grid gap-2">
            {result.issues.slice(0, 20).map((issue, index) => (
              <li
                key={`${issue.code}-${issue.episode ?? issue.shot ?? index}-${index}`}
                className={`grid gap-1 rounded-chip border px-3 py-2 ${
                  issue.severity === 'warning'
                    ? 'border-accent-300 bg-accent-50/40'
                    : 'border-surface-line bg-surface-soft'
                }`}
              >
                <span className="text-[11px] font-medium text-ink-400">
                  {issue.severity === 'warning' ? '需复核' : '提醒'}
                  {issue.episode ? ` · 第 ${issue.episode} 集` : ''}
                  {issue.shot ? ` · 第 ${issue.shot} 镜` : ''}
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
        <p className="text-[10.5px] leading-relaxed text-ink-400">
          这是工程预检，不构成法律意见；不替代版权授权、备案、平台审核或人工复核。
        </p>
      </div>
    </SmoothCollapse>
  )
}
