'use client'

import { useEffect, useState } from 'react'

// 项目状态条只常驻高频判断，低频检查收进“更多”，避免零值挤占首屏。

export type MetaPanel =
  | 'brief' | 'todo' | 'decisions' | 'canon' | 'log' | 'audit' | 'compliance' | 'ledger'

const LOW_FREQUENCY_PANELS: readonly MetaPanel[] = [
  'canon',
  'decisions',
  'audit',
  'compliance',
  'ledger',
  'log',
]

interface Props {
  briefFilled: boolean
  todoCount: number
  decisionCount: number
  canonIssueCount: number
  logCount: number
  auditCount: number
  complianceCount: number
  ledgerCount: number
  active: MetaPanel | null
  onToggle: (panel: MetaPanel) => void
}

export default function WorkMeta({
  briefFilled,
  todoCount,
  decisionCount,
  canonIssueCount,
  logCount,
  auditCount,
  complianceCount,
  ledgerCount,
  active,
  onToggle,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const lowFrequencyActive = active
    ? LOW_FREQUENCY_PANELS.includes(active)
    : false

  // 外部跳转也可能直接打开低频面板，此时同步展开“更多”，避免入口隐藏。
  useEffect(() => {
    if (lowFrequencyActive) setMoreOpen(true)
  }, [lowFrequencyActive])

  function countLabel(count: number) {
    return count > 0 ? ` ${count}` : ''
  }

  function togglePanel(panel: MetaPanel) {
    onToggle(panel)
    if (LOW_FREQUENCY_PANELS.includes(panel)) setMoreOpen(true)
  }

  return (
    <div className="workmeta" role="group" aria-label="项目状态">
      <button
        type="button"
        className={active === 'brief' ? 'on' : ''}
        aria-expanded={active === 'brief'}
        onClick={() => togglePanel('brief')}
      >
        创作契约 · {briefFilled ? '已填' : '未填'}
      </button>
      <button
        type="button"
        className={active === 'todo' ? 'on' : ''}
        aria-expanded={active === 'todo'}
        onClick={() => togglePanel('todo')}
      >
        待办{countLabel(todoCount)}
      </button>
      <button
        type="button"
        className={moreOpen || lowFrequencyActive ? 'on' : ''}
        aria-expanded={moreOpen}
        aria-controls="workmeta-more-panel"
        onClick={() => setMoreOpen((open) => !open)}
      >
        更多
      </button>
      {moreOpen && (
        <div id="workmeta-more-panel" className="workmeta-more-panel" role="group" aria-label="更多项目状态">
          <button
            type="button"
            className={active === 'canon' ? 'on' : ''}
            aria-expanded={active === 'canon'}
            onClick={() => togglePanel('canon')}
          >
            Canon{countLabel(canonIssueCount)}
          </button>
          <button
            type="button"
            className={active === 'decisions' ? 'on' : ''}
            aria-expanded={active === 'decisions'}
            onClick={() => togglePanel('decisions')}
          >
            决策{countLabel(decisionCount)}
          </button>
          <button
            type="button"
            className={active === 'audit' ? 'on' : ''}
            aria-expanded={active === 'audit'}
            onClick={() => togglePanel('audit')}
          >
            创作体检{countLabel(auditCount)}
          </button>
          <button
            type="button"
            className={active === 'compliance' ? 'on' : ''}
            aria-expanded={active === 'compliance'}
            onClick={() => togglePanel('compliance')}
          >
            合规预检{countLabel(complianceCount)}
          </button>
          <button
            type="button"
            className={active === 'ledger' ? 'on' : ''}
            aria-expanded={active === 'ledger'}
            onClick={() => togglePanel('ledger')}
          >
            生产台账{countLabel(ledgerCount)}
          </button>
          <button
            type="button"
            className={active === 'log' ? 'on' : ''}
            aria-expanded={active === 'log'}
            onClick={() => togglePanel('log')}
          >
            判断{countLabel(logCount)}
          </button>
        </div>
      )}
    </div>
  )
}
