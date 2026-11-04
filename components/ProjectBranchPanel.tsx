'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  createProjectBranch,
  listProjectBranches,
  listSnapshots,
  type SnapshotDto,
} from '@/lib/assets/api'
import { ARTIFACT_KINDS } from '@/lib/assets/types'
import type { ProjectBranch } from '@/lib/project-collaboration'

interface Props {
  projectId: string | null
}

const KIND_LABEL: Record<string, string> = {
  idea: '故事',
  characters: '核心人物',
  acts: '三幕',
  episodes: '分集',
  visualCharacters: '视觉定妆',
  scenes: '场次',
  visualPlaces: '地点',
  shots: '分镜',
}

export default function ProjectBranchPanel({ projectId }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotDto[]>([])
  const [branches, setBranches] = useState<ProjectBranch[]>([])
  const [snapshotId, setSnapshotId] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) {
      setSnapshots([])
      setBranches([])
      return
    }
    let active = true
    Promise.all([
      Promise.all(ARTIFACT_KINDS.map((kind) => listSnapshots(projectId, kind).catch(() => []))),
      listProjectBranches(projectId).catch(() => []),
    ]).then(([lists, nextBranches]) => {
      if (!active) return
      const nextSnapshots = lists.flat().sort((left, right) => right.createdAt - left.createdAt)
      setSnapshots(nextSnapshots)
      setBranches(nextBranches)
      setSnapshotId(nextSnapshots[0]?.id ?? '')
    })
    return () => {
      active = false
    }
  }, [projectId])

  const selected = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === snapshotId) ?? null,
    [snapshotId, snapshots],
  )

  async function createBranch() {
    if (!projectId || !selected || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const branch = await createProjectBranch(projectId, {
        name: name.trim() || `${KIND_LABEL[selected.kind] || selected.kind} v${selected.version} 分支`,
        baseSnapshotId: selected.id,
        note,
      })
      setBranches((current) => [branch, ...current])
      setName('')
      setNote('')
      setNotice(`已从 v${branch.baseVersion} 创建分支「${branch.name}」`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '分支创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-panel border border-surface-line bg-surface-raised px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold text-ink-800">版本分支</h3>
          <p className="mt-0.5 text-[9.5px] leading-relaxed text-ink-400">
            从已经落库的快照分叉，不覆盖当前版本。
          </p>
        </div>
        <span className="shrink-0 font-mono text-[9px] text-ink-400">{branches.length} 个</span>
      </div>

      {snapshots.length === 0 ? (
        <p className="mt-3 border-t border-surface-line pt-3 text-[10px] text-ink-400">
          当前项目还没有可分支的正式快照。
        </p>
      ) : (
        <div className="mt-3 grid gap-2 border-t border-surface-line pt-3">
          <label className="grid gap-1.5">
            <span className="text-[9px] text-ink-400">基线版本</span>
            <select
              value={snapshotId}
              onChange={(event) => setSnapshotId(event.target.value)}
              className="min-h-9 rounded-chip border border-surface-line bg-surface-base px-2.5 text-[10px] text-ink-700 outline-none focus:border-accent-300"
            >
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {KIND_LABEL[snapshot.kind] || snapshot.kind} · v{snapshot.version} · {new Date(snapshot.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="分支名称"
              className="min-h-9 min-w-0 rounded-chip border border-surface-line bg-surface-base px-2.5 text-[10px] text-ink-700 outline-none focus:border-accent-300"
            />
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1_000}
              placeholder="这次想试什么"
              className="min-h-9 min-w-0 rounded-chip border border-surface-line bg-surface-base px-2.5 text-[10px] text-ink-700 outline-none focus:border-accent-300"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-[9px] text-ink-400" role="status" aria-live="polite">
              {notice || '分支只记录基线，不改动当前正文'}
            </p>
            <button
              type="button"
              disabled={!projectId || !selected || busy}
              onClick={() => void createBranch()}
              className="min-h-9 shrink-0 rounded-chip border border-accent-300 px-3 text-[9.5px] text-accent-700 disabled:cursor-wait disabled:opacity-45"
            >
              {busy ? '创建中…' : '创建分支'}
            </button>
          </div>
          {branches.length > 0 && (
            <div className="mt-1 border-t border-surface-line pt-1">
              {branches.slice(0, 8).map((branch) => (
                <div key={branch.id} className="flex items-center justify-between gap-2 border-b border-surface-line/70 py-2 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] text-ink-700">{branch.name}</p>
                    <p className="mt-0.5 text-[8.5px] text-ink-400">
                      {KIND_LABEL[branch.baseKind] || branch.baseKind} · v{branch.baseVersion}
                      {branch.note ? ` · ${branch.note}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[8.5px] text-ink-300">
                    {new Date(branch.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
