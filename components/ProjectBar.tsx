'use client'

// 项目条：当前项目 + 切换 + 重命名 + 删除 + 新建。
//
// 为什么需要它：以前整站只认「最近那个项目」，用户没法回到上一部戏，
// 也没法把一个刚跑完的项目改名——这两件事是「多用几次」与「只用一次」的分界。
import { useEffect, useRef, useState } from 'react'
import type { ProjectDto } from '@/lib/assets/api'
import SmoothCollapse from './SmoothCollapse'

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
  /** 匿名会话项目只能靠导出带走，项目条常驻备份入口 */
  onBackup: (mode: "delivery" | "backup") => void
  onImportPackage: (file: File) => void
  onExportMarkdown: () => void
  onCopyAll: () => void
  onCopyLink: () => void
  onCopyReviewLink: () => void
  copied: boolean
  exportProgress?: string | null
  importProgress?: string | null
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
  onBackup,
  onImportPackage,
  onExportMarkdown,
  onCopyAll,
  onCopyLink,
  onCopyReviewLink,
  copied,
  exportProgress = null,
  importProgress = null,
}: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing) requestAnimationFrame(() => nameInputRef.current?.focus())
  }, [editing])

  useEffect(() => {
    if (exportProgress || importProgress) setExportOpen(true)
  }, [exportProgress, importProgress])

  const current = projects.find((p) => p.id === currentId) ?? null
  const title = current?.title ?? (hasContent ? '未保存的新项目' : '还没有项目')

  const startRename = () => {
    if (!current) return
    setDraft(current.title)
    setEditing(true)
  }

  return (
    <div className="surface project-ledger px-3.5 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="shrink-0 text-[11px] text-ink-400">项目</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex min-w-[9rem] flex-1 items-center gap-2 truncate rounded-chip px-2 py-1 text-left text-sm font-medium text-ink-900
            transition-colors hover:bg-surface-deep/60"
          title={projects.length > 0 ? '切换项目' : '还没有保存过项目'}
        >
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`h-3.5 w-3.5 shrink-0 fill-none stroke-current text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-surface-soft px-2.5 py-1.5 text-[11px] text-ink-500"
          title="项目绑定当前浏览器的匿名会话；清理浏览器数据或更换设备后，需要用导出的项目包备份"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 fill-none stroke-current [stroke-width:1.4]">
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          仅本机
        </span>
        <button
          type="button"
          onClick={startRename}
          disabled={!current}
          className="shrink-0 rounded-pill border border-surface-line px-2.5 py-1.5 text-xs text-ink-600
            transition-colors hover:border-accent-300 hover:text-accent-700 disabled:opacity-40"
        >
          重命名
        </button>
        <button
          type="button"
          disabled={!hasContent}
          onClick={() => setExportOpen((value) => !value)}
          aria-expanded={exportOpen}
          className="project-backup rounded-chip border border-surface-line px-2.5 py-1.5 text-xs text-ink-600 sm:ml-auto
            transition-colors hover:border-accent-300 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          导出
        </button>
      </div>

      <SmoothCollapse open={exportOpen}>
        <div className="project-export-menu mt-2 border-t border-surface-line pt-2">
          <p className="mb-2 text-[10.5px] leading-relaxed text-ink-400">
            交付包只带已采用图和执行文件；完整备份保留全部版本、任务和历史候选。
          </p>
          <div className="project-export-actions flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(exportProgress)}
            onClick={() => onBackup("delivery")}
            className="min-h-11 flex-1 rounded-chip bg-accent-700 px-3 py-1.5 text-[11px] font-medium text-white
              transition-colors hover:bg-accent-800 disabled:cursor-wait disabled:opacity-60"
          >
            导出交付包
          </button>
          <button
            type="button"
            disabled={Boolean(exportProgress)}
            onClick={() => onBackup("backup")}
            className="min-h-11 flex-1 rounded-chip border border-done-300 bg-done-50 px-3 py-1.5 text-[11px] font-medium text-done-900
              transition-colors hover:bg-done-100 disabled:cursor-wait disabled:opacity-60"
          >
            导出完整备份
          </button>
          <button
            type="button"
            onClick={() => { setExportOpen(false); onExportMarkdown() }}
            className="min-h-11 flex-1 rounded-chip border border-surface-line px-3 py-1.5 text-[11px] font-medium text-ink-700
              transition-colors hover:border-accent-300 hover:text-accent-700"
          >
            导出 Markdown
          </button>
          <button
            type="button"
            onClick={() => { setExportOpen(false); onCopyAll() }}
            className="min-h-11 flex-1 rounded-chip border border-surface-line px-3 py-1.5 text-[11px] font-medium text-ink-700
              transition-colors hover:border-accent-300 hover:text-accent-700"
          >
            {copied ? '已复制大纲' : '复制全部大纲'}
          </button>
          <button
            type="button"
            disabled={!current}
            onClick={() => { setExportOpen(false); onCopyLink() }}
            className="min-h-11 flex-1 rounded-chip border border-surface-line px-3 py-1.5 text-[11px] font-medium text-ink-700
              transition-colors hover:border-accent-300 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            复制项目链接
          </button>
          <button
            type="button"
            disabled={!current}
            onClick={() => { setExportOpen(false); onCopyReviewLink() }}
            className="min-h-11 flex-1 rounded-chip border border-surface-line px-3 py-1.5 text-[11px] font-medium text-ink-700
              transition-colors hover:border-accent-300 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            生成审阅链接
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={Boolean(importProgress)}
            className="project-import-action min-h-11 flex-1 rounded-chip border border-surface-line bg-surface-soft px-3 py-1.5 text-[11px] font-medium text-ink-600
              transition-colors hover:border-accent-300 hover:text-accent-700 disabled:cursor-wait disabled:opacity-60"
          >
            导入项目包
          </button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) onImportPackage(file)
            }}
          />
          {(exportProgress || importProgress) && (
            <p className="mt-2 rounded-chip bg-surface-soft px-2.5 py-1.5 text-[10.5px] text-ink-500" role="status" aria-live="polite">
              {exportProgress || importProgress}
            </p>
          )}
        </div>
      </SmoothCollapse>

      <SmoothCollapse open={editing}>
        <div className="mt-2 flex gap-2">
          <input
            ref={nameInputRef}
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
      </SmoothCollapse>

      <SmoothCollapse open={open}>
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
      </SmoothCollapse>
    </div>
  )
}
