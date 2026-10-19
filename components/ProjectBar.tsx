'use client'

// 项目条：当前项目 + 切换 + 重命名 + 删除 + 新建。
//
// 为什么需要它：以前整站只认「最近那个项目」，用户没法回到上一部戏，
// 也没法把一个刚跑完的项目改名——这两件事是「多用几次」与「只用一次」的分界。
import { useState } from 'react'
import type { ProjectDto } from '@/lib/assets/api'

interface Props {
  projects: ProjectDto[]
  /** 当前项目 id；还没生成过任何东西时为 null（此时叫「未命名」） */
  currentId: string | null
  /** 工作台里有没有内容——有内容时切换/新建要先清空，得让用户知道 */
  hasContent: boolean
  onSwitch: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onNew: () => void
  /** 载入示例项目：第一次来的人先看见"做出来是什么样" */
  onLoadSample: () => void
}

function when(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function ProjectBar({
  projects,
  currentId,
  hasContent,
  onSwitch,
  onRename,
  onDelete,
  onNew,
  onLoadSample,
}: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const current = projects.find((p) => p.id === currentId) ?? null
  const title = current?.title ?? (hasContent ? '未保存的新项目' : '还没有项目')

  const startRename = () => {
    if (!current) return
    setDraft(current.title)
    setEditing(true)
  }

  return (
    <div className="surface px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-ink-400">项目</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-w-0 flex-1 truncate rounded-chip px-2 py-1 text-left text-sm font-medium text-ink-900
            transition-colors hover:bg-surface-deep/60"
          title={projects.length > 0 ? '切换项目' : '还没有保存过项目'}
        >
          {title}
        </button>
        <button
          type="button"
          onClick={startRename}
          disabled={!current}
          className="shrink-0 rounded-pill border border-surface-line px-2.5 py-1 text-[11px] text-ink-600
            transition-colors hover:border-accent-300 hover:text-accent-700 disabled:opacity-40"
        >
          重命名
        </button>
      </div>

      {editing && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={100}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) { onRename(current!.id, draft.trim()); setEditing(false) }
              if (e.key === 'Escape') setEditing(false)
            }}
            aria-label="项目名"
            className="min-w-0 flex-1 rounded-chip border border-surface-line bg-surface-card px-2.5 py-1.5 text-sm
              text-ink-800 focus:border-accent-300 focus:outline-none"
          />
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={() => { onRename(current!.id, draft.trim()); setEditing(false) }}
            className="shrink-0 rounded-pill bg-accent-600 px-3 py-1.5 text-[11px] font-medium text-white
              transition-colors hover:bg-accent-700 disabled:opacity-50"
          >
            保存
          </button>
        </div>
      )}

      {open && (
        <div className="mt-2.5 border-t border-surface-line pt-2.5">
          {projects.length === 0 ? (
            <p className="px-1 py-1 text-[11px] text-ink-400">还没有项目。写下想法、点生成，就会自动建一个。</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {projects.map((p) => {
                const isCurrent = p.id === currentId
                return (
                  <li key={p.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { onSwitch(p.id); setOpen(false) }}
                      className={`min-w-0 flex-1 truncate rounded-chip px-2 py-1.5 text-left text-xs transition-colors
                        ${isCurrent ? 'bg-accent-100 font-semibold text-accent-700' : 'text-ink-700 hover:bg-surface-deep/60'}`}
                      title={p.title}
                    >
                      {p.title}
                      <span className="ml-2 text-[10px] font-normal text-ink-400">{when(p.updatedAt)}</span>
                    </button>
                    {confirmingId === p.id ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { onDelete(p.id); setConfirmingId(null) }}
                          className="rounded-pill bg-accent-600 px-2 py-1 text-[10px] font-medium text-white"
                        >
                          确认删除
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="rounded-pill border border-surface-line px-2 py-1 text-[10px] text-ink-600"
                        >
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(p.id)}
                        className="shrink-0 rounded-pill px-2 py-1 text-[10px] text-ink-400
                          transition-colors hover:bg-accent-50 hover:text-accent-700"
                      >
                        删除
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => { onNew(); setOpen(false) }}
            className="mt-2 w-full rounded-chip border border-surface-line px-3 py-1.5 text-[11px] text-ink-600
              transition-colors hover:border-accent-300 hover:text-accent-700"
          >
            新建项目（清空工作台，下次生成时保存成一个新项目）
          </button>

          {/* 示例常驻在项目列表里：不管当前有没有项目都能点，第一次来的人也找得到 */}
          <button
            type="button"
            onClick={() => { onLoadSample(); setOpen(false) }}
            className="mt-1.5 w-full rounded-chip border border-dashed border-surface-line-2 px-3 py-1.5 text-[11px]
              text-ink-500 transition-colors hover:border-accent-300 hover:text-accent-700"
          >
            载入示例项目（六步都有内容，不花额度）
          </button>
        </div>
      )}
    </div>
  )
}
