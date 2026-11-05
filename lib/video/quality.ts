import type { GeneratedAsset } from "../generation/types.ts"
import type { MobileVideoTarget } from "../mobile-video.ts"

export interface VideoQualityIssue {
  shotId: string
  targetLabel: string
  episode: number
  shotNumber: number
  severity: "error" | "warning"
  code:
    | "missing-video"
    | "failed-task"
    | "missing-asset"
    | "duration-mismatch"
    | "missing-dimensions"
    | "aspect-mismatch"
    | "invalid-file-metadata"
  message: string
}

export interface VideoQualityReport {
  totalShots: number
  checkedVideos: number
  blockedShots: number
  warningShots: number
  issues: VideoQualityIssue[]
}

function ratioValue(ratio: string): number {
  return ratio === "16:9" ? 16 / 9 : 9 / 16
}

export function auditVideoCandidates(input: {
  targets: MobileVideoTarget[]
  assets: GeneratedAsset[]
  episode?: number
}): VideoQualityReport {
  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]))
  const targets = input.targets.filter((target) =>
    input.episode === undefined || target.episode === input.episode
  )
  const issues: VideoQualityIssue[] = []

  for (const target of targets) {
    const push = (
      code: VideoQualityIssue["code"],
      severity: VideoQualityIssue["severity"],
      message: string,
    ) => issues.push({
      shotId: target.targetId,
      targetLabel: target.targetLabel,
      episode: target.episode,
      shotNumber: target.shotNumber,
      severity,
      code,
      message,
    })

    if (!target.selectedVideoAssetId) {
      push("missing-video", "error", "缺少已采用视频")
      continue
    }
    if (target.latestTaskStatus === "failed" || target.latestTaskStatus === "canceled") {
      push("failed-task", "error", "最新视频任务失败或已取消")
    }
    const video = assetsById.get(target.selectedVideoAssetId)
    if (!video) {
      push("missing-asset", "error", "已采用视频素材不存在，等同缺少已采用视频")
      continue
    }
    if (video.mime !== "video/mp4" || !video.sha256) {
      push("invalid-file-metadata", "error", "视频格式或文件指纹不完整")
    }
    if (!video.durationMs || video.durationMs <= 0) {
      push("duration-mismatch", "warning", "视频缺少可读取时长")
    } else if (Math.abs(video.durationMs - target.duration * 1000) > 500) {
      push(
        "duration-mismatch",
        "warning",
        `视频时长 ${(video.durationMs / 1000).toFixed(1)}s 与分镜时长 ${target.duration}s 不一致`,
      )
    }
    if (!video.width || !video.height) {
      push("missing-dimensions", "warning", "视频缺少分辨率元数据")
    } else {
      const actual = video.width / video.height
      const expected = ratioValue(target.ratio)
      if (Math.abs(actual - expected) / expected > 0.03) {
        push(
          "aspect-mismatch",
          "warning",
          `画幅 ${video.width}×${video.height} 与分镜 ${target.ratio} 不一致`,
        )
      }
    }
  }

  const affectedErrors = new Set(
    issues.filter((issue) => issue.severity === "error").map((issue) => issue.shotId),
  )
  const affectedWarnings = new Set(
    issues.filter((issue) => issue.severity === "warning").map((issue) => issue.shotId),
  )
  return {
    totalShots: targets.length,
    checkedVideos: targets.filter((target) => target.selectedVideoAssetId).length,
    blockedShots: affectedErrors.size,
    warningShots: [...affectedWarnings].filter((shotId) => !affectedErrors.has(shotId)).length,
    issues,
  }
}
