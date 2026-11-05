'use client'

import type { WorkspaceMode } from '@/lib/app-nav'

const MODES: Array<{ id: WorkspaceMode; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'create', label: '创作' },
  { id: 'canvas', label: '画布' },
]

interface Props {
  mode: WorkspaceMode
  onChange: (mode: WorkspaceMode) => void
}

/** 总览、创作和画布属于同一项目的三种工作面，不拆成独立路由页面。 */
export default function WorkspaceModeTabs({ mode, onChange }: Props) {
  return (
    <nav className="workspace-mode-tabs" aria-label="工作台模式" role="tablist">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={mode === item.id}
          className={mode === item.id ? 'active' : ''}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
