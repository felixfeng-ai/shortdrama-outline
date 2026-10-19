'use client'

// 项目状态条：项目 / 意图 / 待办 / 判断收成一行，点哪段展开哪段。
// 目的是让"可选项"不再各自占一行，把视觉主角留给想法与当前步骤。

export type MetaPanel = 'brief' | 'todo' | 'log'

interface Props {
  briefFilled: boolean
  todoCount: number
  logCount: number
  active: MetaPanel | null
  onToggle: (panel: MetaPanel) => void
}

export default function WorkMeta({ briefFilled, todoCount, logCount, active, onToggle }: Props) {
  return (
    <div className="workmeta" role="group" aria-label="项目状态">
      <button
        type="button"
        className={active === 'brief' ? 'on' : ''}
        aria-expanded={active === 'brief'}
        onClick={() => onToggle('brief')}
      >
        创作意图 · {briefFilled ? '已填' : '未填'}
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
        className={active === 'log' ? 'on' : ''}
        aria-expanded={active === 'log'}
        onClick={() => onToggle('log')}
      >
        判断 {logCount}
      </button>
    </div>
  )
}
