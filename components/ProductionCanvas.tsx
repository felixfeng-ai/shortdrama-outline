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

function CanvasStepIcon({ index }: { index: number }) {
  if (index === 0) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h8A2.5 2.5 0 0 1 15.5 7v12H7.5A2.5 2.5 0 0 1 5 16.5z" /><path d="M15.5 7H19v12h-6.5A2.5 2.5 0 0 1 10 16.5" /><path d="M8 8h4M8 11h3" /></svg>
  }
  if (index === 1) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9" r="2.5" /><path d="M3.5 19c.4-3 2.4-5 5.5-5s5.1 2 5.5 5M13 14.5c3.6-.8 6.2.8 7 4.5" /></svg>
  }
  if (index === 2) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9h18M3 15h18" /></svg>
  }
  if (index === 3) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m10 9 5 3-5 3z" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v11H4zM8 7.5V5h8v2.5" /><path d="m8 13 2 2 5-5" /></svg>
}

const EMPTY_CANVAS_NODES = [
  { label: "故事", detail: "人物与分集" },
  { label: "角色", detail: "定妆与场景" },
  { label: "分镜", detail: "镜头与首帧" },
  { label: "视频", detail: "候选与采用" },
  { label: "成片", detail: "时间线与交付" },
] as const

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
        <div className="production-canvas-empty-visual" aria-hidden="true">
          {EMPTY_CANVAS_NODES.map((node, index) => (
            <div key={node.label} className={`production-canvas-preview-node is-tone-${index}`}>
              <span><CanvasStepIcon index={index} /></span>
              <div><b>{node.label}</b><small>{node.detail}</small></div>
            </div>
          ))}
        </div>
        <div className="production-canvas-empty-copy">
          <span>PRODUCTION CANVAS</span>
          <h2>先建立生产计划</h2>
          <p>选择样片、小批或整季后，这里会按真实集、场、镜和视频状态展开。</p>
          <button className="wfx-button" type="button" onClick={onShowFlow}>
            去设置项目
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
