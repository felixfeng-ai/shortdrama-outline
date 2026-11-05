'use client'

import { useEffect, useRef, useState } from 'react'
import type { AgentEntity } from '@/lib/agent/tools'
import type { EntityComment } from '@/lib/entity-comments'
import type { ReusableAsset } from '@/lib/assets/library'
import AssetLibraryPanel, { type AssetLibrarySource } from './AssetLibraryPanel'
import EntityCommentsPanel from './EntityCommentsPanel'
import ProjectBranchPanel from './ProjectBranchPanel'

type ToolTab = 'comments' | 'assets' | 'branches'

interface Props {
  open: boolean
  onClose: () => void
  projectId: string | null
  entities: AgentEntity[]
  comments: EntityComment[]
  onCommentCreated: (comment: EntityComment) => void
  onCommentUpdated: (comment: EntityComment) => void
  assetSources: AssetLibrarySource[]
  onReuseAsset: (asset: ReusableAsset) => void
}

const TOOL_TABS: Array<{
  id: ToolTab
  label: string
  description: string
}> = [
  {
    id: 'comments',
    label: '实体批注',
    description: '把意见锚定到角色、地点、分集或镜头，只生成待确认修改',
  },
  {
    id: 'assets',
    label: '跨项目资产',
    description: '复用角色、地点和视觉设定，不带走本地图片',
  },
  {
    id: 'branches',
    label: '版本分支',
    description: '从已保存快照开一个试验分支，不覆盖当前正文',
  },
]

export default function ProjectToolsPanel({
  open,
  onClose,
  projectId,
  entities,
  comments,
  onCommentCreated,
  onCommentUpdated,
  assetSources,
  onReuseAsset,
}: Props) {
  const [activeTool, setActiveTool] = useState<ToolTab>('comments')
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const openCount = comments.filter((comment) => comment.status === 'open').length

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => closeRef.current?.focus(), 30)

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      )].filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
      previousFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="project-tools-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="project-tools-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-tools-title"
      >
        <header className="project-tools-head">
          <div>
            <span>PROJECT TOOLS</span>
            <h2 id="project-tools-title">项目工具</h2>
            <p>低频项目操作，只在需要时打开，不影响当前创作步骤。</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭项目工具">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </header>

        <div className="project-tools-tabs" role="tablist" aria-label="项目工具">
          {TOOL_TABS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              role="tab"
              className="project-tools-tab"
              aria-selected={activeTool === tool.id}
              onClick={() => setActiveTool(tool.id)}
            >
              <span>
                <b>{tool.label}</b>
                {tool.id === 'comments' && openCount > 0 && <em>{openCount} 待处理</em>}
              </span>
              <small>{tool.description}</small>
            </button>
          ))}
        </div>

        <div className="project-tools-content">
          {!projectId ? (
            <p className="project-tools-empty">请先保存当前项目，再使用项目工具。</p>
          ) : (
            <>
              {activeTool === 'comments' && (
                <EntityCommentsPanel
                  projectId={projectId}
                  entities={entities}
                  comments={comments}
                  onCreated={onCommentCreated}
                  onUpdated={onCommentUpdated}
                />
              )}
              {activeTool === 'assets' && (
                <AssetLibraryPanel
                  projectId={projectId}
                  sources={assetSources}
                  onReuse={onReuseAsset}
                />
              )}
              {activeTool === 'branches' && <ProjectBranchPanel projectId={projectId} />}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
