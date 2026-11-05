import type { GeneratedAsset, GenerationTask } from "./generation/types.ts"

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function number(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export interface MobileVideoReadiness {
  totalShots: number
  frameReady: number
  videoReady: number
  missingFrame: number
  missingVideo: number
  activeTasks: number
  failedTasks: number
}

export interface MobileVideoTarget {
  targetType: "shot"
  targetId: string
  targetLabel: string
  episode: number
  shotNumber: number
  scene: string
  prompt: string
  duration: number
  ratio: "9:16" | "16:9"
  selectedFrameAssetId: string | null
  selectedVideoAssetId: string | null
  latestTaskStatus: GenerationTask["status"] | null
  blockedReason: string | null
}

export interface MobileVideoView {
  readiness: MobileVideoReadiness
  targets: MobileVideoTarget[]
}

function mediaKind(value: GeneratedAsset | GenerationTask): "image" | "video" | "audio" {
  return value.mediaKind ?? "image"
}

function latestSelectedAsset(
  assets: GeneratedAsset[],
  targetId: string,
  kind: "image" | "video",
): GeneratedAsset | null {
  return assets
    .filter((asset) =>
      mediaKind(asset) === kind
      && asset.targetType === "shot"
      && asset.targetId === targetId
      && asset.selectedAt !== null
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
}

export function buildMobileVideoView(input: {
  shots: unknown
  assets?: GeneratedAsset[]
  tasks?: GenerationTask[]
}): MobileVideoView {
  const assets = input.assets ?? []
  const tasks = (input.tasks ?? [])
    .filter((task) => mediaKind(task) === "video")
    .sort((left, right) => right.createdAt - left.createdAt)
  const latestTaskByTarget = new Map<string, GenerationTask>()
  for (const task of tasks) {
    if (!latestTaskByTarget.has(task.targetId)) latestTaskByTarget.set(task.targetId, task)
  }

  // 一个镜头只有同时具备稳定 ID 和可用提示词时，才能进入视频生产候选。
  const targets = (Array.isArray(input.shots) ? input.shots : [])
    .map(record)
    .flatMap((shot): MobileVideoTarget[] => {
      const targetId = text(shot.entityId) || text(shot.id)
      if (!targetId) return []
      const prompt = text(shot.prompt) || text(shot.action)
      const frame = latestSelectedAsset(assets, targetId, "image")
      const video = latestSelectedAsset(assets, targetId, "video")
      const params = record(shot.params)
      const ratio = text(params.ratio) === "16:9" ? "16:9" : "9:16"
      const duration = Math.max(4, Math.min(15, Math.floor(number(params.duration, 5))))
      const episode = number(shot.episode, 0)
      const shotNumber = number(shot.shot, 0)
      const scene = text(shot.scene) || "未命名场景"
      const blockedReason = !prompt
        ? "镜头缺少提示词"
        : !frame
          ? "先采用一张首帧"
          : null
      return [{
        targetType: "shot",
        targetId,
        targetLabel: `${episode > 0 ? `第 ${episode} 集 · ` : ""}第 ${shotNumber} 镜 · ${scene}`,
        episode,
        shotNumber,
        scene,
        prompt,
        duration,
        ratio,
        selectedFrameAssetId: frame?.id ?? null,
        selectedVideoAssetId: video?.id ?? null,
        latestTaskStatus: latestTaskByTarget.get(targetId)?.status ?? null,
        blockedReason,
      }]
    })

  const frameReady = targets.filter((target) => target.selectedFrameAssetId).length
  const videoReady = targets.filter((target) => target.selectedVideoAssetId).length
  const taskStatuses = [...latestTaskByTarget.values()].map((task) => task.status)
  return {
    readiness: {
      totalShots: targets.length,
      frameReady,
      videoReady,
      missingFrame: Math.max(0, targets.length - frameReady),
      missingVideo: Math.max(0, targets.length - videoReady),
      activeTasks: taskStatuses.filter((status) => status === "queued" || status === "running").length,
      failedTasks: taskStatuses.filter((status) => status === "failed" || status === "canceled").length,
    },
    targets,
  }
}
