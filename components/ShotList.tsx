'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import BatchGenerationPanel from './BatchGenerationPanel'
import ShotBoardCard from './ShotBoardCard'
import { fetchProjectGenerationAssets } from '@/lib/generation/client'
import type { GeneratedAsset, GenerationStatus, GenerationTask } from '@/lib/generation/types'
import type { Shot } from '@/lib/assets/types'
import type { LookBook } from '@/lib/look'
import {
  buildShotWorkbenchTree,
  filterShotsForWorkbench,
  groupShotsByEpisode,
} from '@/lib/shots'

interface Props {
  shots: Shot[]
  progress?: string | null
  onChange: (next: Shot[]) => void
  activeShotId?: string | null
  onSelect?: (id: string) => void
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  look: LookBook
  episodeCount: number
}

function setWorkbenchQuery(input: {
  episode: number | null
  scene: string | null
  shot: string | null
}) {
  // 深链格式：?episode=N&scene=天台·夜&shot=<稳定镜头 id>
  const url = new URL(window.location.href)
  if (input.episode === null) url.searchParams.delete('episode')
  else url.searchParams.set('episode', String(input.episode))
  if (input.scene === null) url.searchParams.delete('scene')
  else url.searchParams.set('scene', input.scene)
  if (input.shot === null) url.searchParams.delete('shot')
  else url.searchParams.set('shot', input.shot)
  window.history.replaceState({}, '', url)
}

export default function ShotList({
  shots,
  progress,
  onChange,
  activeShotId = null,
  onSelect,
  projectId,
  onEnsureProject,
  look,
  episodeCount,
}: Props) {
  const [episodeFilter, setEpisodeFilter] = useState<number | null>(null)
  const [sceneFilter, setSceneFilter] = useState<string | null>(null)
  const [treeOpen, setTreeOpen] = useState(true)
  const [generationAssets, setGenerationAssets] = useState<GeneratedAsset[]>([])
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([])
  const onSelectRef = useRef(onSelect)

  const tree = useMemo(() => buildShotWorkbenchTree(shots), [shots])
  const visibleShots = useMemo(
    () => filterShotsForWorkbench(shots, episodeFilter, sceneFilter),
    [episodeFilter, sceneFilter, shots],
  )
  const groups = useMemo(() => groupShotsByEpisode(visibleShots), [visibleShots])
  const episodeOptions = useMemo(() => {
    const used = new Set(tree.map((group) => group.episode))
    const highest = Math.max(0, Math.floor(episodeCount), episodeFilter ?? 0, ...used)
    return Array.from({ length: highest + 1 }, (_, episode) => episode)
  }, [episodeCount, episodeFilter, tree])
  const selectedEpisode = episodeFilter
  const selectedEpisodeLabel = selectedEpisode === null
    ? '全部集'
    : selectedEpisode === 0
      ? '未标注镜头'
      : `第 ${selectedEpisode} 集`
  const episodeTree = tree.find((group) => group.episode === episodeFilter)

  const assetByShot = useMemo(() => {
    const map = new Map<string, GeneratedAsset>()
    for (const asset of generationAssets) {
      if (asset.targetType !== 'shot') continue
      const current = map.get(asset.targetId)
      if (!current || (asset.selectedAt && !current.selectedAt)) map.set(asset.targetId, asset)
    }
    return map
  }, [generationAssets])

  const taskByShot = useMemo(() => {
    const map = new Map<string, GenerationTask>()
    for (const task of generationTasks) {
      if (task.targetType === 'shot' && !map.has(task.targetId)) map.set(task.targetId, task)
    }
    return map
  }, [generationTasks])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const rawEpisode = params.get('episode')
      const parsed = rawEpisode === null ? null : Number(rawEpisode)
      setEpisodeFilter(
        parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null,
      )
      setSceneFilter(params.get('scene') || null)
      const shotId = params.get('shot')
      if (shotId) onSelectRef.current?.(shotId)
    }
    syncFromUrl()
    const onResize = () => {
      if (window.innerWidth < 1100) setTreeOpen(false)
    }
    onResize()
    window.addEventListener('popstate', syncFromUrl)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('popstate', syncFromUrl)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (!projectId) {
      setGenerationAssets([])
      setGenerationTasks([])
      return
    }
    let active = true
    const load = () => {
      fetchProjectGenerationAssets(projectId)
        .then((state) => {
          if (!active) return
          setGenerationAssets(state.assets)
          setGenerationTasks(state.tasks)
        })
        .catch(() => {
          if (active) {
            setGenerationAssets([])
            setGenerationTasks([])
          }
        })
    }
    load()
    window.addEventListener('chengju:generation-updated', load)
    return () => {
      active = false
      window.removeEventListener('chengju:generation-updated', load)
    }
  }, [projectId])

  function update(id: string, patch: Partial<Shot>) {
    onChange(shots.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)))
  }

  function changeEpisodeFilter(value: string) {
    const next = value === 'all' ? null : Math.max(0, Math.floor(Number(value)))
    setEpisodeFilter(next)
    setSceneFilter(null)
    setWorkbenchQuery({ episode: next, scene: null, shot: null })
  }

  function changeSceneFilter(label: string | null) {
    setSceneFilter(label)
    setWorkbenchQuery({ episode: episodeFilter, scene: label, shot: null })
  }

  function selectShot(shot: Shot, updateScope = false) {
    if (updateScope) {
      const nextEpisode = shot.episode > 0 ? shot.episode : 0
      const nextScene = shot.scene.trim() || '场景未标注'
      setEpisodeFilter(nextEpisode)
      setSceneFilter(nextScene)
      setWorkbenchQuery({ episode: nextEpisode, scene: nextScene, shot: shot.id })
    } else {
      setWorkbenchQuery({ episode: episodeFilter, scene: sceneFilter, shot: shot.id })
    }
    onSelect?.(shot.id)
    requestAnimationFrame(() => {
      document.querySelector(`[data-shot-id="${shot.id}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    })
  }

  return (
    <div className={`shot-workbench ${treeOpen ? 'has-tree' : 'tree-collapsed'}`}>
      <aside className="shot-tree" aria-label="集场镜树">
        <div className="shot-tree-head">
          <div>
            <b>分镜树</b>
            <span>{shots.length} 镜 · {tree.length} 集</span>
          </div>
          <button type="button" onClick={() => setTreeOpen(false)} aria-label="收起分镜树">×</button>
        </div>

        <button
          type="button"
          className={`shot-tree-all ${episodeFilter === null ? 'is-active' : ''}`}
          onClick={() => changeEpisodeFilter('all')}
        >
          全剧镜头
          <span>{shots.length}</span>
        </button>

        <div className="shot-tree-episodes">
          {tree.map((episode) => {
            const active = episode.episode === episodeFilter
            return (
              <div key={episode.episode} className={`shot-tree-episode ${active ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="shot-tree-episode-head"
                  onClick={() => changeEpisodeFilter(String(episode.episode))}
                >
                  <span>{episode.label}</span>
                  <small>{episode.shotCount} 镜 · {episode.durationSeconds}s</small>
                  {episode.missingRefShots > 0 && <em>缺图 {episode.missingRefShots}</em>}
                </button>

                {active && (
                  <div className="shot-tree-scenes">
                    <button
                      type="button"
                      className={sceneFilter === null ? 'is-active' : ''}
                      onClick={() => changeSceneFilter(null)}
                    >
                      本集全部场次
                    </button>
                    {episode.scenes.map((scene, sceneIndex) => (
                      <div key={`${episode.episode}-${sceneIndex}`} className="shot-tree-scene">
                        <button
                          type="button"
                          className={sceneFilter === scene.label ? 'is-active' : ''}
                          onClick={() => changeSceneFilter(scene.label)}
                        >
                          <span>{scene.label}</span>
                          <small>{scene.shots.length} 镜</small>
                        </button>
                        <div>
                          {scene.shots.map((shot) => (
                            <button
                              key={shot.id}
                              type="button"
                              className={shot.id === activeShotId ? 'is-active' : ''}
                              onClick={() => selectShot(shot)}
                            >
                              <b>{String(shot.shot).padStart(2, '0')}</b>
                              <span>{shot.scene || '场景未标注'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      <section className="shot-board" aria-label="分镜卡流">
        <div className="shot-board-toolbar">
          <div className="flex min-w-0 items-center gap-2">
            {!treeOpen && (
              <button type="button" className="shot-tree-open" onClick={() => setTreeOpen(true)}>
                分镜树
              </button>
            )}
            <label>
              <span>审阅范围</span>
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
            {sceneFilter && (
              <button type="button" className="shot-scene-filter" onClick={() => changeSceneFilter(null)}>
                {sceneFilter} ×
              </button>
            )}
          </div>
          <p>
            <span>{selectedEpisodeLabel}</span>
            <span>{visibleShots.length} 镜</span>
          </p>
        </div>

        {progress && (
          <p role="status" className="shot-board-progress">{progress}</p>
        )}

        <BatchGenerationPanel
          scope="shots"
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

        <div className="shot-board-flow">
          {groups.map((group) => (
            <section key={group.episode} className="shot-board-episode">
              <header>
                <b>{group.episode === 0 ? '未标注' : `第 ${group.episode} 集`}</b>
                <span>{group.shotCount} 镜</span>
                <span>{group.durationSeconds}s</span>
                {group.missingRefShots > 0 && <em>缺图 {group.missingRefShots}</em>}
              </header>
              {group.scenes.map((scene, sceneIndex) => (
                <div key={`${group.episode}-${sceneIndex}`} className="shot-board-scene">
                  <div className="shot-board-scene-head">
                    <span>{scene.label}</span>
                    <small>{scene.shots.length} 镜</small>
                  </div>
                  <div className="shot-board-list">
                    {scene.shots.map((shot) => {
                      const task = taskByShot.get(shot.entityId)
                      return (
                        <ShotBoardCard
                          key={shot.id}
                          shot={shot}
                          active={shot.id === activeShotId}
                          thumbnailUrl={assetByShot.get(shot.entityId)?.downloadUrl}
                          taskStatus={task?.status as GenerationStatus | undefined}
                          onSelect={() => selectShot(shot)}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
          {groups.length === 0 && (
            <div className="shot-board-empty">
              <p>当前范围还没有镜头。</p>
              {episodeFilter !== null && (
                <button type="button" onClick={() => changeEpisodeFilter('all')}>查看全部集</button>
              )}
            </div>
          )}
        </div>
      </section>

      <span className="sr-only" aria-live="polite">
        {activeShotId ? '已选中镜头，右侧可编辑属性' : ''}
      </span>
      {treeOpen && <button type="button" className="shot-tree-backdrop" aria-label="收起分镜树" onClick={() => setTreeOpen(false)} />}
      {episodeTree && (
        <span className="sr-only">
          当前集 {episodeTree.shotCount} 镜，共 {episodeTree.durationSeconds} 秒
        </span>
      )}
    </div>
  )
}
