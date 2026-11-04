'use client'

// 项目状态条：项目 / 意图 / 待办 / 判断收成一行，点哪段展开哪段。
// 目的是让"可选项"不再各自占一行，把视觉主角留给想法与当前步骤。

export type MetaPanel = 'brief' | 'todo' | 'decisions' | 'canon' | 'log' | 'audit' | 'compliance'

interface Props {
  briefFilled: boolean
  todoCount: number
  decisionCount: number
  canonIssueCount: number
  logCount: number
  auditCount: number
  complianceCount: number
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
  active,
  onToggle,
}: Props) {
  return (
    <div className="workmeta" role="group" aria-label="项目状态">
      <button
        type="button"
        className={active === 'brief' ? 'on' : ''}
        aria-expanded={active === 'brief'}
        onClick={() => onToggle('brief')}
      >
        创作契约 · {briefFilled ? '已填' : '未填'}
      </button>
      <span className="workmeta-sep" aria-hidden="true">·</span>
      <button
        type="button"
        className={active === 'canon' ? 'on' : ''}
        aria-expanded={active === 'canon'}
        onClick={() => onToggle('canon')}
      >
        Canon {canonIssueCount}
      </button>
      <span className="workmeta-sep" aria-hidden="true">·</span>
      <button
        type="button"
        className={active === 'decisions' ? 'on' : ''}
        aria-expanded={active === 'decisions'}
        onClick={() => onToggle('decisions')}
      >
        决策 {decisionCount}
      </button>
      <span className="workmeta-sep" aria-hidden="true">·</span>
      <button
        type="button"
        className={active === 'todo' ? 'on' : ''}
        aria-expanded={active === 'todo'}
        onClick={() => onToggle('todo')}
      >
        待办 {todoCount}
      </button>
      <span className="workmeta-sep" aria-hidden="true">·</span>
      <button
        type="button"
        className={active === 'audit' ? 'on' : ''}
        aria-expanded={active === 'audit'}
        onClick={() => onToggle('audit')}
      >
        创作体检 {auditCount}
      </button>
      <span className="workmeta-sep" aria-hidden="true">·</span>
      <button
        type="button"
        className={active === 'compliance' ? 'on' : ''}
        aria-expanded={active === 'compliance'}
        onClick={() => onToggle('compliance')}
      >
        合规预检 {complianceCount}
      </button>
      <span className="workmeta-sep" aria-hidden="true">·</span>
      <button
        type="button"
        className={active === 'log' ? 'on' : ''}
        aria-expanded={active === 'log'}
        onClick={() => onToggle('log')}
      >
        判断 {logCount}
      </button>
    </div>
  )
}
