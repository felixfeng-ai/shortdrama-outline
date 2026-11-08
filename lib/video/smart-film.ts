import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { latestSnapshot } from "../assets/repo.ts"
import { recommendSystemBgmTracks } from "../audio/system-bgm.ts"
import {
  createAndSynthesizeShotTts,
  prepareShotTts,
} from "../audio/tts-tasks.ts"
import {
  listGeneratedAssets,
  listGenerationTasks,
  selectGeneratedAsset,
} from "../generation/repo.ts"
import type { GeneratedAsset } from "../generation/types.ts"
import { quotaUnitsForCostMicros } from "../model-pricing.ts"
import { withQuotaReservation } from "../quota.ts"
import { syncTimelineSelectedVideoSources } from "../timeline/initial.ts"
import {
  freezeTimelineVersion,
  getTimelineDraft,
  initializeEpisodeTimeline,
  saveTimelineDraft,
} from "../timeline/repo.ts"
import type { TimelinePayload } from "../timeline/types.ts"
import { inspectTimelineDialogue, type TimelineShotInput } from "./render-plan.ts"

function shotId(shot: TimelineShotInput): string {
  return typeof shot.entityId === "string"
    ? shot.entityId.trim()
    : typeof shot.id === "string"
      ? shot.id.trim()
      : ""
}

function latestVideosByShot(assets: GeneratedAsset[]): Map<string, GeneratedAsset> {
  const result = new Map<string, GeneratedAsset>()
  for (const asset of [...assets]
    .filter((item) =>
      (item.mediaKind ?? "image") === "video"
      && item.targetType === "shot"
    )
    .sort((left, right) => right.createdAt - left.createdAt)) {
    if (!result.has(asset.targetId)) result.set(asset.targetId, asset)
  }
  return result
}

function projectContext(db: DatabaseSync, projectId: string): string {
  return (db.prepare(
    `SELECT kind, payload
     FROM snapshots s
     WHERE project_id = ?
       AND version = (
         SELECT MAX(version) FROM snapshots latest
         WHERE latest.project_id = s.project_id AND latest.kind = s.kind
       )
     ORDER BY kind`,
  ).all(projectId) as { kind: string; payload: string }[])
    .map((row) => `${row.kind}:${row.payload}`)
    .join("\n")
    .slice(0, 80_000)
}

export async function prepareSmartEpisodeFilm(
  db: DatabaseSync,
  input: {
    projectId: string
    episode: number
    identity: string
    signal?: AbortSignal
  },
): Promise<{
  draftRevision: number
  version: ReturnType<typeof freezeTimelineVersion>
  adoptedVideoCount: number
  generatedTtsCount: number
  warnings: string[]
  bgmTrackId: string | null
}> {
  const snapshot = latestSnapshot(db, input.projectId, "shots")
  if (!snapshot || !Array.isArray(snapshot.payload)) {
    throw new InputError("还没有分镜，不能智能成片")
  }
  const shots = snapshot.payload.filter(
    (item): item is TimelineShotInput =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  )
  const episodeShots = shots.filter((shot) =>
    Math.max(0, Math.floor(Number((shot as Record<string, unknown>).episode))) === input.episode
  )
  if (episodeShots.length === 0) {
    throw new InputError(`第 ${input.episode} 集还没有分镜`)
  }

  const warnings: string[] = []
  let adoptedVideoCount = 0
  let videos = listGeneratedAssets(db, input.projectId, undefined, undefined, "video")
  const latestVideos = latestVideosByShot(videos)
  for (const shot of episodeShots) {
    const id = shotId(shot)
    if (!id) continue
    const selected = videos.find((video) =>
      video.targetId === id && video.selectedAt !== null
    )
    if (selected) continue
    const candidate = latestVideos.get(id)
    if (!candidate) continue
    selectGeneratedAsset(db, input.projectId, candidate.id)
    adoptedVideoCount += 1
  }
  if (adoptedVideoCount > 0) {
    videos = listGeneratedAssets(db, input.projectId, undefined, undefined, "video")
  }

  const existing = getTimelineDraft(db, input.projectId, input.episode)
  if (!existing) {
    initializeEpisodeTimeline(db, input.projectId, input.episode)
  }
  const current = getTimelineDraft(db, input.projectId, input.episode)
  if (!current) throw new InputError("时间线创建失败")
  let payload = syncTimelineSelectedVideoSources(current.payload, videos)

  if (payload.blockedCount > 0) {
    const missing = payload.clips
      .filter((clip) => clip.status !== "ready")
      .map((clip) => `第 ${clip.shotNumber} 镜`)
    throw new InputError(`仍有镜头没有可用视频：${missing.join("、")}`)
  }

  let generatedTtsCount = 0
  const audioTasks = listGenerationTasks(db, input.projectId, undefined, undefined, "audio")
  const audioAssets = listGeneratedAssets(db, input.projectId, undefined, undefined, "audio")
  const inspection = inspectTimelineDialogue({
    timeline: payload,
    shots,
    tasks: audioTasks,
    assets: audioAssets,
  })
  const missingAudioClipIds = new Set(
    inspection.issues
      .filter((issue) => issue.code === "missing-dialogue-audio" && issue.clipId)
      .map((issue) => issue.clipId!),
  )
  for (const clip of payload.clips) {
    if (!missingAudioClipIds.has(clip.id)) continue
    try {
      const prepared = prepareShotTts(db, input.projectId, clip.shotId)
      const units = quotaUnitsForCostMicros(prepared.estimatedCostMicros)
      await withQuotaReservation(
        db,
        input.identity,
        "audio",
        units,
        () => createAndSynthesizeShotTts(db, {
          projectId: input.projectId,
          shotId: clip.shotId,
          maxBudgetMicros: prepared.estimatedCostMicros,
          idempotencyKey: `smart-film:${input.episode}:${clip.shotId}`,
          signal: input.signal,
        }),
        {
          requestId: `smart-film:tts:${input.projectId}:${input.episode}:${clip.shotId}`,
        },
      )
      generatedTtsCount += 1
      clip.muted = false
    } catch (error) {
      clip.muted = true
      warnings.push(
        `第 ${clip.shotNumber} 镜未生成配音，已自动静音：${error instanceof Error ? error.message : "配音失败"}`,
      )
    }
  }

  const recommended = recommendSystemBgmTracks(projectContext(db, input.projectId), 1)[0]
  if (!payload.audio.bgmAssetId && recommended) {
    payload = {
      ...payload,
      audio: {
        ...payload.audio,
        bgmAssetId: recommended.id,
        bgmVolume: 0.3,
        bgmFadeInMs: 600,
        bgmFadeOutMs: 1_000,
      },
    }
  }

  const dialogueStillMissing = inspectTimelineDialogue({
    timeline: payload,
    shots,
    tasks: listGenerationTasks(db, input.projectId, undefined, undefined, "audio"),
    assets: listGeneratedAssets(db, input.projectId, undefined, undefined, "audio"),
  }).issues
  if (dialogueStillMissing.length > 0) {
    throw new InputError(dialogueStillMissing[0].message)
  }

  const saved = saveTimelineDraft(
    db,
    input.projectId,
    input.episode,
    current.revision,
    payload as TimelinePayload,
  )
  const version = freezeTimelineVersion(
    db,
    input.projectId,
    input.episode,
    saved.revision,
  )
  return {
    draftRevision: saved.revision,
    version,
    adoptedVideoCount,
    generatedTtsCount,
    warnings,
    bgmTrackId: recommended?.id ?? null,
  }
}
