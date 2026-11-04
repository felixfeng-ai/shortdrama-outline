'use client'

import { useState } from 'react'
import { copyText } from '@/lib/export'
import {
  productionLedgerCsv,
  type ProductionLedger,
} from '@/lib/production-ledger'
import SmoothCollapse from './SmoothCollapse'

interface Props {
  open: boolean
  ledger: ProductionLedger
}

function priority(row: ProductionLedger['rows'][number]): number {
  return (row.status === 'rework' ? 100 : 0)
    + row.openComments * 20
    + row.qcIssues.length * 10
    + row.missingReferences.length * 5
    + (row.status === 'todo' ? 1 : 0)
}

function statusLabel(status: ProductionLedger['rows'][number]['status']): string {
  if (status === 'done') return '已出图'
  if (status === 'rework') return '需返修'
  return '待出图'
}

export default function ProductionLedgerPanel({ open, ledger }: Props) {
  const [copied, setCopied] = useState(false)
  const rows = ledger.rows.slice().sort((left, right) =>
    priority(right) - priority(left)
    || left.episode - right.episode
    || left.shot - right.shot
  )

  async function copyLedger() {
    const done = await copyText(productionLedgerCsv(ledger))
    setCopied(done)
  }

  return (
    <SmoothCollapse open={open} className="brief">
      <div className="brief-body production-ledger-panel">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-chip border border-surface-line bg-surface-soft px-3 py-2 text-[10.5px] text-ink-500 sm:grid-cols-4">
          <span>镜头 {ledger.summary.totalShots}</span>
          <span>完成 {ledger.summary.doneShots}</span>
          <span>返修 {ledger.summary.reworkShots}</span>
          <span>待出图 {ledger.summary.todoShots}</span>
          <span>质检问题 {ledger.summary.issueShots}</span>
          <span>缺参考 {ledger.summary.missingReferenceShots}</span>
          <span>未处理批注 {ledger.summary.openComments}</span>
          <span>失败任务 {ledger.summary.failedTasks}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10.5px] text-ink-400">
            逐镜汇总批注、质检、任务与采用图；按问题优先排序。
          </p>
          <button
            type="button"
            onClick={() => void copyLedger()}
            className="min-h-8 rounded-chip border border-surface-line px-2.5 text-[10px] text-ink-600
              transition-colors hover:border-accent-300 hover:text-accent-700"
          >
            {copied ? '台账已复制' : '复制台账 CSV'}
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-[11px] text-ink-500">还没有分镜，暂时无法生成生产台账。</p>
        ) : (
          <ul className="grid gap-2">
            {rows.slice(0, 20).map((row) => (
              <li
                key={row.entityId}
                className="grid gap-1 rounded-chip border border-surface-line bg-surface-soft px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <strong className="text-[11.5px] font-medium text-ink-800">
                    第 {row.episode || '?'} 集 · 第 {row.shot} 镜 · {row.scene}
                  </strong>
                  <span className="text-[10px] text-ink-400">{statusLabel(row.status)}</span>
                  {row.openComments > 0 && (
                    <span className="text-[10px] text-accent-700">批注 {row.openComments}</span>
                  )}
                  {row.qcIssues.length > 0 && (
                    <span className="text-[10px] text-accent-700">质检 {row.qcIssues.length}</span>
                  )}
                </div>
                <p className="text-[10.5px] leading-relaxed text-ink-500">
                  {row.qcIssues[0] || row.latestComment || row.latestTask?.error || '当前没有阻断信息'}
                </p>
                <p className="truncate text-[9.5px] text-ink-400">
                  {row.entityId} · {row.ratio} · {row.duration}s · 采用图 {row.hasSelectedAsset ? '有' : '无'}
                </p>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 20 && (
          <p className="text-[10.5px] text-ink-400">另有 {rows.length - 20} 镜未展开；导出 CSV 可查看完整台账。</p>
        )}
      </div>
    </SmoothCollapse>
  )
}
