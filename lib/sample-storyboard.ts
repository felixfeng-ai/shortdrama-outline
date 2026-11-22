import fs from "node:fs"
import path from "node:path"
import type { DatabaseSync } from "node:sqlite"

import { writeGeneratedArtifact } from "./generation/files.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  listGeneratedAssets,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "./generation/repo.ts"
import type { GeneratedAsset } from "./generation/types.ts"
import { SAMPLE_SHOTS } from "./sample.ts"

const SAMPLE_STORYBOARD_VERSION = "sample-storyboard-v2"

interface SampleFrame {
  shotId: string
  file: string
  mime: "image/jpeg" | "image/webp"
  width: number
  height: number
}

const SAMPLE_FRAMES: SampleFrame[] = [
  {
    shotId: "st-1",
    file: "visuals/premium/umbrella-heir.webp",
    mime: "image/webp",
    width: 1080,
    height: 1920,
  },
  {
    shotId: "st-2",
    file: "visuals/premium/estate-rain.webp",
    mime: "image/webp",
    width: 1080,
    height: 1920,
  },
  {
    shotId: "st-4",
    file: "sample/storyboard-ticket.jpg",
    mime: "image/jpeg",
    width: 1080,
    height: 1920,
  },
  {
    shotId: "st-3",
    file: "visuals/premium/green-corridor.webp",
    mime: "image/webp",
    width: 1080,
    height: 1920,
  },
  {
    shotId: "st-5",
    file: "sample/storyboard-door.jpg",
    mime: "image/jpeg",
    width: 1080,
    height: 1920,
  },
]

function writeSampleFrame(projectId: string, shotId: string, file: string, mime: string) {
  const source = path.join(process.cwd(), "public", ...file.split("/"))
  const extension = mime === "image/webp" ? "webp" : "jpg"
  return writeGeneratedArtifact(
    projectId,
    `sample-storyboard/${shotId}.${extension}`,
    new Uint8Array(fs.readFileSync(source)),
  )
}

/**
 * 示例动态分镜必须使用与正式播放器相同的已采用资产事实。
 * 这里直接写成功任务和零额度资产，不进入模型队列；任务使用固定幂等键，
 * 因而重复载入示例只会补缺失文件，不会重复扣费、创建候选或出现假进度。
 */
export function ensureSampleStoryboardMedia(
  db: DatabaseSync,
  projectId: string,
): { created: number; selected: GeneratedAsset[] } {
  let created = 0
  const targetByShot = new Map(
    SAMPLE_SHOTS.map((shot) => [shot.id, shot.entityId ?? shot.id]),
  )

  for (const frame of SAMPLE_FRAMES) {
    const targetId = targetByShot.get(frame.shotId) ?? frame.shotId
    const existing = listGeneratedAssets(db, projectId, "shot", targetId, "image")
      .find((asset) =>
        asset.selectedAt !== null
        && asset.prompt.includes("已采用定妆图")
      )
    if (existing) continue

    const taskPrompt = [
      "已采用定妆图 身份参考",
      `VeyaTV sample storyboard still: ${frame.shotId}`,
    ].join("\n")
    const task = createGenerationTask(db, {
      projectId,
      targetType: "shot",
      targetId,
      providerId: "veya-sample",
      model: "sample-storyboard-still",
      prompt: taskPrompt,
      mediaKind: "image",
      idempotencyKey: `${SAMPLE_STORYBOARD_VERSION}:${frame.shotId}`,
      estimatedCostMicros: 0,
      actualCostMicros: 0,
      quotaUnits: 0,
      request: { sample: true },
    })

    let assetId = task.assetId
    if (!assetId) {
      const file = writeSampleFrame(projectId, frame.shotId, frame.file, frame.mime)
      const asset = saveGeneratedAsset(db, {
        taskId: task.id,
        projectId,
        targetType: "shot",
        targetId,
        storageKey: file.storageKey,
        mime: frame.mime,
        bytes: file.bytes,
        providerId: "veya-sample",
        model: "sample-storyboard-still",
        prompt: task.prompt,
        mediaKind: "image",
        width: frame.width,
        height: frame.height,
        generationMeta: {
          sample: true,
          source: frame.file,
        },
      })
      assetId = asset.id
      completeGenerationTask(db, task.id, asset.id)
      created += 1
    }

    selectGeneratedAsset(db, projectId, assetId)
  }

  const selected = listGeneratedAssets(db, projectId, "shot", undefined, "image")
    .filter((asset) => asset.selectedAt !== null)
  return { created, selected }
}
