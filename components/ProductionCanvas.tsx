"use client"

import { useMemo } from "react"

import type { Episode } from "@/lib/types"
import type { Scene, Shot } from "@/lib/assets/types"
import type { GeneratedAsset } from "@/lib/generation/types"
import type { ProductionPlanDto } from "@/lib/production/client"
import { buildProductionCanvasModel } from "@/lib/production/canvas"
import ProductionMap from "./ProductionMap"

interface Props {
  productionPlan: ProductionPlanDto | null
  characterCount: number
  episodes: Episode[]
  scenes: Scene[]
  shots: Shot[]
  assets: GeneratedAsset[]
  onOpenShot: (shotId: string) => void
  onShowFlow: () => void
}

export default function ProductionCanvas({
  productionPlan,
  characterCount,
  episodes,
  scenes,
  shots,
  assets,
  onOpenShot,
  onShowFlow,
}: Props) {
  const selectedAssets = useMemo(
    () => assets.filter((asset) => Boolean(asset.selectedAt)),
    [assets],
  )
  const model = useMemo(() => productionPlan
    ? buildProductionCanvasModel({
      plan: productionPlan,
      counts: {
        characters: characterCount,
        episodes: episodes.length,
        scenes: scenes.length,
        shots: shots.length,
        images: selectedAssets.filter((asset) => asset.mediaKind === "image").length,
        videos: selectedAssets.filter((asset) => asset.mediaKind === "video").length,
        stale: shots.filter((shot) => shot.status === "rework").length,
        blocked: shots.filter((shot) => shot.missingRefFor.length > 0).length,
      },
    })
    : null, [characterCount, episodes.length, productionPlan, scenes.length, selectedAssets, shots])

  if (!productionPlan || !model) {
    const previewEpisodes = episodes.slice(0, 3)
    const previewScenes = scenes.slice(0, 3)
    const previewShots = shots.slice(0, 3)
    return (
      <section className="production-canvas production-canvas-empty">
        <div className="production-canvas-facts">
          <header>
            <div>
              <span>当前项目事实</span>
              <b>{episodes.length} 集 · {scenes.length} 场 · {shots.length} 镜</b>
            </div>
            <em>{selectedAssets.length} 个已采用画面</em>
          </header>
          <div className="production-canvas-fact-columns">
            <section>
              <span>分集</span>
              {previewEpisodes.length > 0
                ? previewEpisodes.map((episode) => (
                    <div key={episode.id}>
                      <b>第 {episode.number} 集</b>
                      <small>{episode.title}</small>
                    </div>
                  ))
                : <p>还没有分集内容</p>}
            </section>
            <section>
              <span>场次</span>
              {previewScenes.length > 0
                ? previewScenes.map((scene) => (
                    <div key={scene.id}>
                      <b>场 {String(scene.number).padStart(2, "0")}</b>
                      <small>{scene.location}</small>
                    </div>
                  ))
                : <p>还没有场次内容</p>}
            </section>
            <section>
              <span>镜头</span>
              {previewShots.length > 0
                ? previewShots.map((shot) => (
                    <div key={shot.id}>
                      <b>第 {shot.shot} 镜</b>
                      <small>{shot.status === "rework" ? "需返修" : shot.status === "done" ? "已出图" : "待制作"}</small>
                    </div>
                  ))
                : <p>还没有镜头内容</p>}
            </section>
          </div>
        </div>
        <div className="production-canvas-empty-copy">
          <span>PRODUCTION CANVAS</span>
          <h2>把已有内容变成可执行的生产关系</h2>
          <p>项目内容已经存在。确认样片、小批或整季范围后，画布会按真实集、场、镜和交付缺口展开，不重新生成正文。</p>
          <button className="wfx-button" type="button" onClick={onShowFlow}>
            确认制作范围
          </button>
        </div>
      </section>
    )
  }

  const mapEpisodes = episodes.map((episode) => ({
    id: episode.id,
    episode: episode.number,
    title: episode.title,
    note: episode.hook,
  }))
  const mapScenes = scenes.map((scene) => ({
    id: scene.id,
    episode: scene.episode,
    scene: scene.location,
    title: `第 ${scene.number} 场 · ${scene.location}`,
    meta: `${scene.timeOfDay} · ${scene.characters.join("、")}`,
    note: scene.summary,
  }))
  const mapShots = shots.map((shot) => ({
    id: shot.id,
    targetId: shot.entityId,
    episode: shot.episode,
    scene: shot.scene,
    shotNumber: shot.shot,
    title: `第 ${shot.shot} 镜`,
    meta: shot.action,
    status: shot.status,
    duration: shot.params.duration,
    missing: shot.missingRefFor.length > 0 || shot.status === "rework",
  }))

  return (
    <section className="production-canvas" aria-labelledby="production-canvas-title">
      <header className="production-canvas-head">
        <div>
          <span>PRODUCTION CANVAS</span>
          <h2 id="production-canvas-title">从人物到成片的生产依赖</h2>
          <p>节点计数来自当前项目事实。点击镜头回到工作台，自由画布只保存关系，不复制正文。</p>
        </div>
        <div className="production-canvas-summary">
          <span><b>{model.summary.blocked}</b> 阻断</span>
          <span><b>{model.summary.stale}</b> 过期</span>
          <span><b>{productionPlan.targetEpisodes}</b> 目标集</span>
        </div>
      </header>

      <div className="production-canvas-nodes" aria-label="生产依赖">
        {model.nodes.map((node, index) => (
          <div key={node.key} className={`production-canvas-node is-${node.status}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <b>{node.label}</b>
            <strong>{node.count}</strong>
            <small>
              {node.missing > 0
                ? `缺 ${node.missing}`
                : node.count === 0
                  ? "未开始"
                  : "已齐"}
            </small>
          </div>
        ))}
      </div>

      <ProductionMap
        episodes={mapEpisodes}
        scenes={mapScenes}
        shots={mapShots}
        assets={assets}
        onOpenShot={onOpenShot}
        onShowFlow={onShowFlow}
      />
    </section>
  )
}
