// 生产画布只做“从项目事实派生视图”，不保存第二份正文。
import type { ProductionPlanSeed } from "./types.ts"

export interface ProductionCanvasCounts {
  characters: number
  episodes: number
  scenes: number
  shots: number
  images: number
  videos: number
  stale: number
  blocked: number
}

export interface ProductionCanvasNode {
  key: "characters" | "episodes" | "scenes" | "shots" | "images" | "videos" | "delivery"
  label: string
  count: number
  missing: number
  status: "ready" | "active" | "blocked"
}

export interface ProductionCanvasModel {
  nodes: ProductionCanvasNode[]
  summary: ProductionCanvasCounts
}

type ProductionPlanLike = Pick<
  ProductionPlanSeed,
  "mode" | "targetEpisodes" | "currentStage"
>

export function buildProductionCanvasModel(input: {
  plan: ProductionPlanLike
  counts: ProductionCanvasCounts
}): ProductionCanvasModel {
  const { counts, plan } = input
  const missingShots = Math.max(0, counts.shots - counts.images)
  const missingVideos = Math.max(0, counts.images - counts.videos)
  const missingEpisodes = Math.max(0, plan.targetEpisodes - counts.episodes)
  const missingDelivery = Math.max(0, plan.targetEpisodes - counts.videos)

  const nodes: ProductionCanvasNode[] = [
    {
      key: "characters",
      label: "核心人物",
      count: counts.characters,
      missing: counts.characters === 0 ? 1 : 0,
      status: counts.characters > 0 ? "ready" : "blocked",
    },
    {
      key: "episodes",
      label: "目标分集",
      count: counts.episodes,
      missing: missingEpisodes,
      status: missingEpisodes === 0 ? "ready" : counts.episodes > 0 ? "active" : "blocked",
    },
    {
      key: "scenes",
      label: "场次",
      count: counts.scenes,
      missing: counts.scenes === 0 ? 1 : 0,
      status: counts.scenes > 0 ? "ready" : "blocked",
    },
    {
      key: "shots",
      label: "分镜",
      count: counts.shots,
      missing: counts.shots === 0 ? 1 : 0,
      status: counts.shots > 0 ? "ready" : "blocked",
    },
    {
      key: "images",
      label: "首帧",
      count: counts.images,
      missing: missingShots,
      status: missingShots === 0 && counts.shots > 0 ? "ready" : counts.images > 0 ? "active" : "blocked",
    },
    {
      key: "videos",
      label: "镜片视频",
      count: counts.videos,
      missing: missingVideos,
      status: missingVideos === 0 && counts.images > 0 ? "ready" : counts.videos > 0 ? "active" : "blocked",
    },
    {
      key: "delivery",
      label: "成片交付",
      count: counts.videos,
      missing: missingDelivery,
      status: missingDelivery === 0 ? "ready" : counts.videos > 0 ? "active" : "blocked",
    },
  ]

  return {
    nodes,
    summary: counts,
  }
}
