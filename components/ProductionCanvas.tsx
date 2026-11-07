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
    return (
      <section className="production-canvas production-canvas-empty">
        <span>PRODUCTION CANVAS</span>
        <h2>先建立生产计划</h2>
        <p>选择样片、小批或整季后，这里会按真实集、场、镜和视频状态展开。</p>
        <button className="wfx-button" type="button" onClick={onShowFlow}>
          去设置项目
        </button>
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
