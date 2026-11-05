'use client'

import { useEffect, useMemo, useState } from 'react'
import type { GeneratedAsset } from '@/lib/generation/types'
import {
  buildProductionMap,
  type ProductionMapItem,
  type ProductionMapShot,
} from '@/lib/production-map'

interface Props {
  episodes: ProductionMapItem[]
  scenes: ProductionMapItem[]
  shots: ProductionMapShot[]
  assets: GeneratedAsset[]
  onOpenShot: (shotId: string) => void
  onShowFlow: () => void
}

function shotState(shot: ProductionMapShot, hasImage: boolean): {
  label: string
  tone: 'done' | 'missing' | 'rework' | 'todo'
} {
  if (shot.status === 'rework') return { label: '需返修', tone: 'rework' }
  if (shot.missing) return { label: '待补', tone: 'missing' }
  if (hasImage) return { label: '已出图', tone: 'done' }
  return { label: '待出图', tone: 'todo' }
}

export default function ProductionMap({
  episodes,
  scenes,
  shots,
  assets,
  onOpenShot,
  onShowFlow,
}: Props) {
  const map = useMemo(
    () => buildProductionMap({ episodes, scenes, shots }),
    [episodes, scenes, shots],
  )
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(
    map.episodes[0]?.number ?? null,
  )

  useEffect(() => {
    setSelectedEpisode((current) => {
      if (current !== null && map.episodes.some((episode) => episode.number === current)) {
        return current
      }
      return map.episodes[0]?.number ?? null
    })
  }, [map.episodes])

  const selected = map.episodes.find((episode) => episode.number === selectedEpisode)
    ?? map.episodes[0]
    ?? null

  const shotAssets = useMemo(() => {
    const latest = new Map<string, GeneratedAsset>()
    for (const asset of assets) {
      if (asset.targetType !== 'shot' || asset.mediaKind !== 'image' || !asset.selectedAt) continue
      const current = latest.get(asset.targetId)
      if (!current || current.createdAt < asset.createdAt) latest.set(asset.targetId, asset)
    }
    return latest
  }, [assets])

  if (map.episodes.length === 0) {
    return (
      <section className="production-map production-map-empty" aria-label="集场镜生产地图">
        <span className="production-empty-mark" aria-hidden="true">00</span>
        <div>
          <h2>制作地图还没有镜头</h2>
          <p>先生成分镜，集、场、镜会按真实数据自动铺开；当前仍可回到六步流程查看项目结构。</p>
          <button type="button" onClick={onShowFlow}>切到六步流程</button>
        </div>
      </section>
    )
  }

  return (
    <section className="production-map" aria-label="集场镜生产地图">
      <header className="production-map-head">
        <div>
          <span>PRODUCTION MAP</span>
          <h2>集 / 场 / 镜生产地图</h2>
          <p>按集切换，场次内直接查看镜头状态、时长和已采用关键帧。</p>
        </div>
        <div className="production-map-totals" aria-label="制作地图汇总">
          <span><b>{map.totals.episodes}</b> 集</span>
          <span><b>{map.totals.scenes}</b> 场</span>
          <span><b>{map.totals.shots}</b> 镜</span>
          <span className={map.totals.missing > 0 ? 'missing' : ''}>
            <b>{map.totals.missing}</b> 待补
          </span>
        </div>
      </header>

      <div className="production-episode-tabs" role="tablist" aria-label="按集查看">
        {map.episodes.map((episode) => (
          <button
            key={episode.number}
            type="button"
            role="tab"
            aria-selected={selected?.number === episode.number}
            className={selected?.number === episode.number ? 'active' : ''}
            onClick={() => setSelectedEpisode(episode.number)}
          >
            <span>{episode.label}</span>
            <b>{episode.title}</b>
            <em>{episode.shotCount} 镜{episode.missingCount ? ` · ${episode.missingCount} 待补` : ''}</em>
          </button>
        ))}
      </div>

      {selected && (
        <div className="production-episode">
          <div className="production-episode-head">
            <div>
              <span>{selected.label}</span>
              <h3>{selected.title}</h3>
              {selected.note && <p>{selected.note}</p>}
            </div>
            <small>
              {selected.scenes.length} 场 · {selected.shotCount} 镜 · {selected.duration}s
              {selected.missingCount > 0 ? ` · ${selected.missingCount} 待补` : ''}
            </small>
          </div>

          <div className="production-scenes">
            {selected.scenes.map((scene, sceneIndex) => (
              <section key={scene.id} className={`production-scene${scene.missingCount ? ' has-issues' : ''}`}>
                <header className="production-scene-head">
                  <span className="production-scene-index">SCENE {String(sceneIndex + 1).padStart(2, '0')}</span>
                  <div>
                    <b>{scene.title}</b>
                    {(scene.meta || scene.note) && <p>{scene.meta || scene.note}</p>}
                  </div>
                  <small>{scene.shots.length} 镜 · {scene.duration}s</small>
                </header>

                <div className="production-shot-grid">
                  {scene.shots.map((shot) => {
                    const asset = shotAssets.get(shot.targetId || shot.id)
                    const state = shotState(shot, Boolean(asset))
                    return (
                      <button
                        key={shot.id}
                        type="button"
                        className={`production-shot ${state.tone}`}
                        onClick={() => onOpenShot(shot.id)}
                        aria-label={`${shot.title}，${state.label}，定位到工作台`}
                      >
                        <span className="production-shot-preview">
                          {asset ? (
                            <img
                              src={asset.downloadUrl}
                              alt={`${shot.title}已采用关键帧`}
                              loading="lazy"
                            />
                          ) : (
                            <span>
                              <b>{String(shot.shotNumber ?? 0).padStart(2, '0')}</b>
                              <small>待出图</small>
                            </span>
                          )}
                        </span>
                        <span className="production-shot-copy">
                          <b>
                            {shot.shotNumber ? `SHOT ${String(shot.shotNumber).padStart(2, '0')}` : 'SHOT'}
                            <em>{state.label}</em>
                          </b>
                          <span>{shot.meta || shot.title}</span>
                          <small>{shot.duration ? `${shot.duration}s` : '时长待补'}</small>
                        </span>
                      </button>
                    )
                  })}
                  {scene.shots.length === 0 && (
                    <p className="production-scene-empty">这场戏还没有拆出镜头。</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
