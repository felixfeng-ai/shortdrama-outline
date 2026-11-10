import type { DeliveryPackageClient } from "./delivery/client.ts"
import type { VideoRenderDto } from "./video/render-types.ts"

export interface OutputSnapshotSummary {
  kind: string
  version: number | null
  itemCount: number
}

export interface OutputInventoryInput {
  projectId: string
  renders: VideoRenderDto[]
  packages: DeliveryPackageClient[]
  snapshots: OutputSnapshotSummary[]
}

export interface OutputInventory {
  latestPlayable: VideoRenderDto | null
  activeRender: VideoRenderDto | null
  playableRenders: VideoRenderDto[]
  deliveryRenders: VideoRenderDto[]
  readyPackages: DeliveryPackageClient[]
  latestPackage: DeliveryPackageClient | null
  publishedRecords: Array<Record<string, unknown>>
  creationKinds: number
  nextAction: {
    label: string
    href: string
    detail: string
  }
}

function newestFirst(left: VideoRenderDto, right: VideoRenderDto): number {
  return right.createdAt - left.createdAt
}

/**
 * 产物中心只汇总真实记录，不从快照数量推断“已经成片”。
 * 成片必须来自 succeeded render，交付包必须来自 delivery package。
 */
export function buildOutputInventory(input: OutputInventoryInput): OutputInventory {
  const orderedRenders = [...input.renders].sort(newestFirst)
  const playableRenders = orderedRenders.filter((render) =>
    render.status === "succeeded" && Boolean(render.videoUrl)
  )
  const activeRender = orderedRenders.find((render) =>
    render.status === "queued" || render.status === "running"
  ) ?? null
  const latestPlayable = playableRenders[0] ?? null
  const deliveryRenders = playableRenders.filter((render) =>
    render.qualityProfile === "delivery"
  )
  const readyPackages = input.packages
    .filter((pkg) => pkg.status === "ready")
    .sort((left, right) => right.updatedAt - left.updatedAt)
  const latestPackage = readyPackages[0] ?? null
  const publishedRecords = input.packages.flatMap((pkg) => pkg.publishRecords)
  const creationKinds = input.snapshots.filter((snapshot) => snapshot.version !== null).length
  const timelineHref = `/?project=${encodeURIComponent(input.projectId)}&step=shots`
  const deliveryHref = `/delivery/${encodeURIComponent(input.projectId)}`

  if (latestPlayable) {
    return {
      latestPlayable,
      activeRender,
      playableRenders,
      deliveryRenders,
      readyPackages,
      latestPackage,
      publishedRecords,
      creationKinds,
      nextAction: {
        label: readyPackages.length > 0 ? "查看交付物" : "创建交付包",
        href: deliveryHref,
        detail: readyPackages.length > 0
          ? "最新交付包已经可下载，继续审片或回填发布记录。"
          : "成片已经可播放，下一步将它整理成平台可用的交付包。",
      },
    }
  }

  if (activeRender) {
    return {
      latestPlayable,
      activeRender,
      playableRenders,
      deliveryRenders,
      readyPackages,
      latestPackage,
      publishedRecords,
      creationKinds,
      nextAction: {
        label: "查看成片进度",
        href: timelineHref,
        detail: `第 ${activeRender.episode} 集正在渲染，完成后成片会自动出现在这里。`,
      },
    }
  }

  return {
    latestPlayable,
    activeRender,
    playableRenders,
    deliveryRenders,
    readyPackages,
    latestPackage,
    publishedRecords,
    creationKinds,
    nextAction: {
      label: "去生成成片",
      href: timelineHref,
      detail: creationKinds > 0
        ? "创作产物已经存在，接下来完成镜头视频、时间线和渲染。"
        : "还没有可播放成片，先从故事和分镜开始建立创作产物。",
    },
  }
}
