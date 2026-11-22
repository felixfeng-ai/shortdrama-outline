import fs from "node:fs"
import path from "node:path"
import type { DatabaseSync } from "node:sqlite"

import { writeGeneratedArtifact } from "./generation/files.ts"
import {
  completeVideoRender,
  createVideoRender,
  listVideoRenders,
} from "./video/render-repo.ts"
import type { VideoRender } from "./video/render-types.ts"

const SAMPLE_TIMELINE_VERSION = "sample-production-v1"
const SAMPLE_DURATION_MS = 6_000

function sampleAssetPath(name: string): string {
  return path.join(process.cwd(), "public", "sample", name)
}

/**
 * 示例成片必须是真正可播放、可下载的媒体文件，而不是空状态或静态截图。
 * 这里复用正式渲染记录和 generated 文件目录，但不会创建模型任务或扣额度。
 */
export function ensureSampleProduction(
  db: DatabaseSync,
  projectId: string,
): { created: boolean; render: VideoRender } {
  const existing = listVideoRenders(db, projectId)
    .find((render) =>
      render.status === "succeeded"
      && render.timelineVersionId === SAMPLE_TIMELINE_VERSION
    )
  if (existing) return { created: false, render: existing }

  const video = writeGeneratedArtifact(
    projectId,
    "sample/sample-production.mp4",
    new Uint8Array(fs.readFileSync(sampleAssetPath("sample-production.mp4"))),
  )
  const subtitle = writeGeneratedArtifact(
    projectId,
    "sample/sample-production.srt",
    new Uint8Array(fs.readFileSync(sampleAssetPath("sample-production.srt"))),
  )
  const manifest = writeGeneratedArtifact(
    projectId,
    "sample/sample-production.json",
    new Uint8Array(fs.readFileSync(sampleAssetPath("sample-production.json"))),
  )

  const render = createVideoRender(db, {
    projectId,
    episode: 1,
    timelineVersionId: SAMPLE_TIMELINE_VERSION,
    timelineRevision: 1,
    qualityProfile: "delivery",
    exportPreset: "vertical",
  })
  const completed = completeVideoRender(db, render.id, {
    // 与 SRT 最后一帧和 manifest 保持同一事实，避免交付审计出现假时长。
    durationMs: SAMPLE_DURATION_MS,
    videoStorageKey: video.storageKey,
    srtStorageKey: subtitle.storageKey,
    manifestStorageKey: manifest.storageKey,
  })
  return { created: true, render: completed }
}
