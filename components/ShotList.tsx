'use client'

import { useEffect, useMemo, useState } from 'react'

import BatchGenerationPanel from './BatchGenerationPanel'
import ShotCard from './ShotCard'
import SmoothCollapse from './SmoothCollapse'
import type { Shot } from '@/lib/assets/types'
import type { LookBook } from '@/lib/look'
import { groupShotsByEpisode } from '@/lib/shots'

interface Props {
  shots: Shot[]
  progress?: string | null
  onChange: (next: Shot[]) => void
  /** 放映厅当前选中的那一镜 */
  activeShotId?: string | null
  /** 点某张镜卡 → 切换放映厅 */
  onSelect?: (id: string) => void
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  look: LookBook
  episodeCount: number
}

export default function ShotList({
  shots, progress, onChange, activeShotId = null, onSelect, projectId, onEnsureProject, look, episodeCount,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())
  const [episodeFilter, setEpisodeFilter] = useState<number | null>(null)

  useEffect(() => {
    const syncFromUrl = () => {
      const raw = new URLSearchParams(window.location.search).get('episode')
      if (raw === null) {
        setEpisodeFilter(null)
        return
      }
      const parsed = Number(raw)
      setEpisodeFilter(Number.isInteger(parsed) && parsed >= 0 ? parsed : null)
    }
    syncFromUrl()
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  const visibleShots = useMemo(
    () => episodeFilter === null ? shots : shots.filter((shot) => shot.episode === episodeFilter),
    [episodeFilter, shots],
  )
  const groups = useMemo(() => groupShotsByEpisode(visibleShots), [visibleShots])
  const indexById = useMemo(
    () => new Map(shots.map((shot, index) => [shot.id, index])),
    [shots],
  )
  const episodeOptions = useMemo(() => {
    const used = new Set(groups.map((group) => group.episode))
    const highest = Math.max(0, Math.floor(episodeCount), episodeFilter ?? 0, ...used)
    return Array.from({ length: highest + 1 }, (_, episode) => episode)
  }, [episodeCount, episodeFilter, groups])

  const update = (id: string, patch: Partial<Shot>) =>
    onChange(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  // 删除后重排镜号，否则会出现「2、3、4…」这种没有第 1 镜的清单
  const remove = (id: string) =>
    onChange(shots.filter((s) => s.id !== id).map((s, i) => ({ ...s, shot: i + 1 })))

  function toggleEpisode(episode: number) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(episode)) next.delete(episode)
      else next.add(episode)
      return next
    })
  }

  function changeEpisodeFilter(value: string) {
    const next = value === 'all' ? null : Math.max(0, Math.floor(Number(value)))
    setEpisodeFilter(next)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      // 筛选状态写进 ?episode=N，分享项目时能直接回到正在审的那一集。
      // episode=0 表示未标注，不是第 1 集。
      if (next === null) url.searchParams.delete('episode')
      else url.searchParams.set('episode', String(next))
      window.history.replaceState({}, '', url)
    }
  }

  const selectedEpisode = episodeFilter
  const selectedEpisodeLabel = selectedEpisode === null
    ? '全部集'
    : selectedEpisode === 0
      ? '未标注镜头'
      : `第 ${selectedEpisode} 集`

  return (
    <div className="space-y-3">
      {progress && (
        <p role="status" className="rounded-chip border border-info-200 bg-info-50 px-3 py-2 text-[11px] text-info-800">
          {progress}
        </p>
      )}

      <div className="shot-episode-filter">
        <label className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[10.5px] font-semibold text-ink-500">审阅范围</span>
          <select
            value={episodeFilter === null ? 'all' : String(episodeFilter)}
            onChange={(event) => changeEpisodeFilter(event.target.value)}
            aria-label="按集筛选分镜"
          >
            <option value="all">全部集</option>
            {episodeOptions.map((episode) => (
              <option key={episode} value={episode}>
                {episode === 0 ? '未标注' : `第 ${episode} 集`}
              </option>
            ))}
          </select>
        </label>
        <p>
          <span>{selectedEpisodeLabel}</span>
          <span>{visibleShots.length} 镜</span>
        </p>
      </div>

      <BatchGenerationPanel
        title={episodeFilter === null ? '批量生成全剧首帧' : `批量生成${selectedEpisodeLabel}首帧`}
        description={
          episodeFilter === null
            ? '当前为全剧范围。建议先按集筛选，再分批生成，成本与返修范围更可控。'
            : '只提交当前筛选内的镜头；每镜仍是独立任务，结果先保存为候选。'
        }
        targets={visibleShots.map((shot) => {
          const prompt = shot.prompt || shot.action || shot.scene
          return {
            key: shot.entityId,
            targetType: 'shot' as const,
            targetId: shot.entityId,
            name: `第 ${shot.shot} 镜 · ${shot.scene}`,
            detail: `${shot.episode === 0 ? '未标注集' : `第 ${shot.episode} 集`} · ${shot.params.ratio} · ${shot.shotSize || '中景'}`,
            prompt,
            aspect: shot.params.ratio === '16:9' ? 'landscape' as const : 'vertical' as const,
            blockedReason: prompt.trim() ? null : '缺镜头提示词',
            warning: shot.missingRefFor.length > 0 ? `缺 ${shot.missingRefFor.length} 张参考` : null,
          }
        })}
        projectId={projectId}
        onEnsureProject={onEnsureProject}
        look={look}
      />

      {groups.map((group) => {
        const open = !collapsed.has(group.episode)
        const unmarked = group.episode === 0
        return (
          <section
            key={group.episode}
            className={`shot-episode min-w-0 ${unmarked ? "is-unmarked" : ""}`}
          >
            <button
              type="button"
              className="shot-episode-head"
              aria-expanded={open}
              aria-label={`${open ? "收起" : "展开"}${unmarked ? "未标注" : `第 ${group.episode} 集`}`}
              onClick={() => toggleEpisode(group.episode)}
            >
              <span className="shot-episode-title">
                <b>{unmarked ? "未标注" : `第 ${group.episode} 集`}</b>
                <small>{unmarked ? "需要确认集号" : "按集审阅"}</small>
              </span>
              <span className="shot-episode-metrics">
                <span>{group.shotCount} 镜</span>
                <span>{group.durationSeconds} 秒</span>
                {group.missingRefShots > 0 && (
                  <span className="is-warning">缺图 {group.missingRefShots}</span>
                )}
                {group.reworkShots > 0 && (
                  <span className="is-warning">返修 {group.reworkShots}</span>
                )}
              </span>
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className={`shot-episode-caret h-4 w-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8] ${open ? "rotate-180" : ""}`}
              >
                <path d="M5 7.5l5 5 5-5" />
              </svg>
            </button>

            <SmoothCollapse open={open}>
              <div className="shot-episode-body">
                {group.scenes.map((scene, sceneIndex) => (
                  <div className="shot-scene-group min-w-0" key={`${group.episode}-${sceneIndex}`}>
                    <div className="shot-scene-head">
                      <span>{scene.label}</span>
                      <small>{scene.shots.length} 镜</small>
                    </div>
                    <div className="space-y-3">
                      {scene.shots.map((shot) => (
                        <ShotCard
                          key={shot.id}
                          shot={shot}
                          index={indexById.get(shot.id) ?? 0}
                          onUpdate={update}
                          onRemove={remove}
                          active={shot.id === activeShotId}
                          onSelect={onSelect}
                          projectId={projectId}
                          onEnsureProject={onEnsureProject}
                          look={look}
                          episodeCount={episodeCount}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SmoothCollapse>
          </section>
        )
      })}
      {groups.length === 0 && (
        <div className="shot-episode-empty">
          <p>{episodeFilter === null ? '还没有可审阅的分镜。' : `${selectedEpisodeLabel}还没有分镜。`}</p>
          {episodeFilter !== null && (
            <button type="button" onClick={() => changeEpisodeFilter('all')}>
              查看全部集
            </button>
          )}
        </div>
      )}
    </div>
  )
}
