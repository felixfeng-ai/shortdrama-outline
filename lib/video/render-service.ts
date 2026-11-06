import fs from "node:fs"

import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { latestSnapshot } from "../assets/repo.ts"
import { getBgmTrack } from "../audio/bgm-repo.ts"
import { notifyRenderFinished } from "../push/service.ts"
import {
  readGeneratedAsset,
  resolveGeneratedStoragePath,
  writeGeneratedArtifact,
} from "../generation/files.ts"
import {
  getGeneratedAsset,
  listGeneratedAssets,
  listGenerationTasks,
} from "../generation/repo.ts"
import type { GeneratedAsset, GenerationTask } from "../generation/types.ts"
import {
  getTimelineVersion,
  listLatestTimelineVersions,
} from "../timeline/repo.ts"
import type { TimelinePayload, TimelineVersion } from "../timeline/types.ts"
import {
  buildFfmpegRenderArgs,
  probeMedia,
  resolveFfmpegPath,
  runMediaCommand,
} from "./render-engine.ts"
import {
  completeVideoRender,
  createVideoRender,
  failVideoRender,
  getVideoRender,
  updateVideoRenderProgress,
} from "./render-repo.ts"
import {
  buildTimelineSrt,
  inspectTimelineDialogue,
  type TimelineShotInput,
} from "./render-plan.ts"
import type {
  RenderIssue,
  TimelineDialogueInspection,
  VideoRender,
} from "./render-types.ts"

interface PreparedRender {
  version: TimelineVersion
  timeline: TimelinePayload
  shots: TimelineShotInput[]
  dialogue: TimelineDialogueInspection
  issues: RenderIssue[]
  tasks: GenerationTask[]
  assets: GeneratedAsset[]
}

function shotId(shot: TimelineShotInput): string {
  return typeof shot.entityId === "string"
    ? shot.entityId.trim()
    : typeof shot.id === "string"
      ? shot.id.trim()
      : ""
}

function fileExists(storageKey: string): boolean {
  try {
    return fs.existsSync(resolveGeneratedStoragePath(storageKey))
  } catch {
    return false
  }
}

function publicRenderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "成片渲染失败"
  // FFmpeg stderr 会带服务器绝对路径；界面只保留可行动的错误行，不泄露目录结构。
  const important = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /error|failed|not found|invalid|不存在|失败|不支持/i.test(line))
    .slice(-3)
    .join(" ")
  const message = (important || raw).slice(0, 800)
  return message
    .replace(/[A-Za-z]:\\(?:[^\\\s"']+\\)*[^\\\s"']+/g, "[本地文件]")
    .replace(/\/(?:[^/\s"']+\/)+[^/\s"']+/g, "[本地文件]")
}

function inspectVersion(db: DatabaseSync, projectId: string, versionId: string): PreparedRender {
  const version = getTimelineVersion(db, projectId, versionId)
  if (!version) throw new InputError("时间线版本不存在或无权访问")
  const snapshot = latestSnapshot(db, projectId, "shots")
  if (!snapshot || !Array.isArray(snapshot.payload)) {
    throw new InputError("还没有分镜，不能渲染成片")
  }
  const shots = snapshot.payload.filter(
    (item): item is TimelineShotInput =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  )
  const timeline = version.payload
  const tasks = listGenerationTasks(db, projectId, undefined, undefined, "audio")
  const assets = listGeneratedAssets(db, projectId, undefined, undefined, "audio")
  const frozenEntries = Object.keys(version.inputHashes)
    .filter((key) => key.startsWith("tts:"))
  const preferredAudioByShot = frozenEntries.length > 0
    ? new Map<string, GeneratedAsset | null>()
    : undefined
  for (const key of frozenEntries) {
    const [, shotId, assetId] = key.split(":")
    if (!shotId || !assetId) continue
    preferredAudioByShot!.set(
      shotId,
      assetId === "missing" ? null : getGeneratedAsset(db, assetId, projectId),
    )
  }
  const dialogue = inspectTimelineDialogue({
    timeline,
    shots,
    tasks,
    assets,
    preferredAudioByShot,
  })
  const issues: RenderIssue[] = [...dialogue.issues]

  if (timeline.clips.length === 0) {
    issues.push({
      code: "empty-timeline",
      clipId: null,
      shotNumber: null,
      message: "时间线没有任何镜头片段",
    })
  }

  const shotsById = new Map(shots.map((shot) => [shotId(shot), shot]))
  for (const clip of timeline.clips) {
    if (!shotsById.has(clip.shotId)) {
      issues.push({
        code: "timeline-incomplete",
        clipId: clip.id,
        shotNumber: clip.shotNumber,
        message: `第 ${clip.shotNumber} 镜已不在当前分镜快照中`,
      })
      continue
    }
    if (clip.status !== "ready" || !clip.sourceAssetId) {
      issues.push({
        code: "timeline-incomplete",
        clipId: clip.id,
        shotNumber: clip.shotNumber,
        message: `第 ${clip.shotNumber} 镜不可渲染：${clip.reason ?? "缺少有效视频"}`,
      })
      continue
    }
    const asset = getGeneratedAsset(db, clip.sourceAssetId, projectId)
    if (!asset || asset.mediaKind !== "video" || asset.targetId !== clip.shotId) {
      issues.push({
        code: "missing-video-asset",
        clipId: clip.id,
        shotNumber: clip.shotNumber,
        message: `第 ${clip.shotNumber} 镜的视频素材不存在或无权访问`,
      })
      continue
    }
    if (!asset.sha256 || version.inputHashes[asset.id] !== asset.sha256) {
      issues.push({
        code: "video-hash-mismatch",
        clipId: clip.id,
        shotNumber: clip.shotNumber,
        message: `第 ${clip.shotNumber} 镜的视频与固化版本指纹不一致`,
      })
    }
    if (!fileExists(asset.storageKey)) {
      issues.push({
        code: "missing-video-asset",
        clipId: clip.id,
        shotNumber: clip.shotNumber,
        message: `第 ${clip.shotNumber} 镜的视频文件已丢失`,
      })
    }
  }

  const bgmId = timeline.audio.bgmAssetId
  if (bgmId) {
    const bgm = getBgmTrack(db, projectId, bgmId)
    if (!bgm || !bgm.licenseConfirmed) {
      issues.push({
        code: "bgm-license-missing",
        clipId: null,
        shotNumber: null,
        message: "本集 BGM 已删除或缺少授权声明",
      })
    } else if (!fileExists(bgm.storageKey)) {
      issues.push({
        code: "missing-audio-asset",
        clipId: null,
        shotNumber: null,
        message: "本集 BGM 文件已丢失",
      })
    }
  }

  for (const line of dialogue.lines) {
    if (!line.assetId || !line.storageKey || line.muted) continue
    if (!fileExists(line.storageKey)) {
      issues.push({
        code: "missing-audio-asset",
        clipId: line.clipId,
        shotNumber: line.shotNumber,
        message: `第 ${line.shotNumber} 镜的对白音频文件已丢失`,
      })
    }
  }

  return { version, timeline, shots, dialogue, issues, tasks, assets }
}

export function preflightTimelineVersion(
  db: DatabaseSync,
  projectId: string,
  versionId: string,
): { version: TimelineVersion; dialogue: TimelineDialogueInspection; issues: RenderIssue[] } {
  const prepared = inspectVersion(db, projectId, versionId)
  return {
    version: prepared.version,
    dialogue: prepared.dialogue,
    issues: prepared.issues,
  }
}

export function enqueueEpisodeRender(
  db: DatabaseSync,
  input: {
    projectId: string
    episode: number
    timelineVersionId: string
    quotaReservationId?: string | null
    quotaUnits?: number
  },
): VideoRender {
  const preflight = preflightTimelineVersion(db, input.projectId, input.timelineVersionId)
  if (preflight.version.episode !== input.episode) {
    throw new InputError("时间线版本与所选集号不一致")
  }
  if (preflight.issues.length > 0) {
    const detail = preflight.issues
      .slice(0, 4)
      .map((issue) => issue.message)
      .join("；")
    throw new InputError(
      `成片预检未通过：${detail}${preflight.issues.length > 4 ? `；另有 ${preflight.issues.length - 4} 项` : ""}`,
    )
  }
  return createVideoRender(db, {
    projectId: input.projectId,
    episode: input.episode,
    timelineVersionId: preflight.version.id,
    timelineRevision: preflight.version.revision,
    quotaReservationId: input.quotaReservationId ?? null,
    quotaUnits: input.quotaUnits ?? 0,
  })
}

export function enqueueFrozenEpisodeQueue(
  db: DatabaseSync,
  input: {
    projectId: string
    episodes: number[]
    quotaReservations?: Record<string, { reservationId: string; units: number }>
  },
): {
  renders: VideoRender[]
  blocked: Array<{ episode: number; reason: string }>
} {
  const requested = new Set(input.episodes.map((episode) => Math.floor(episode)))
  const versions = listLatestTimelineVersions(db, input.projectId)
    .filter((version) => requested.has(version.episode))
  const renders: VideoRender[] = []
  const blocked: Array<{ episode: number; reason: string }> = []
  for (const version of versions) {
    try {
      renders.push(enqueueEpisodeRender(db, {
        projectId: input.projectId,
        episode: version.episode,
        timelineVersionId: version.id,
        quotaReservationId: input.quotaReservations?.[version.id]?.reservationId,
        quotaUnits: input.quotaReservations?.[version.id]?.units,
      }))
    } catch (error) {
      blocked.push({
        episode: version.episode,
        reason: error instanceof Error ? error.message : "预检未通过",
      })
    }
  }
  const withVersion = new Set(versions.map((version) => version.episode))
  for (const episode of requested) {
    if (!withVersion.has(episode)) {
      blocked.push({ episode, reason: "这一集还没有固化时间线版本" })
    }
  }
  return { renders, blocked }
}

function manifestFor(input: {
  render: VideoRender
  version: TimelineVersion
  timeline: TimelinePayload
  dialogue: TimelineDialogueInspection
  width: number
  height: number
  durationMs: number
  bgm: ReturnType<typeof getBgmTrack>
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "chengju-episode-render",
    renderId: input.render.id,
    projectId: input.render.projectId,
    episode: input.render.episode,
    timelineVersionId: input.version.id,
    timelineRevision: input.version.revision,
    generatedAt: new Date().toISOString(),
    aiGenerated: true,
    renderer: {
      provider: "platform",
      engine: "ffmpeg",
      width: input.width,
      height: input.height,
      fps: input.timeline.fps,
      durationMs: input.durationMs,
    },
    subtitle: {
      enabled: input.timeline.subtitle.enabled,
      mode: "sidecar-srt",
    },
    audio: {
      dialogueVolume: input.timeline.audio.dialogueVolume,
      bgmVolume: input.timeline.audio.bgmVolume,
      bgm: input.bgm
        ? {
            id: input.bgm.id,
            name: input.bgm.name,
            sha256: input.bgm.sha256,
            licenseConfirmed: input.bgm.licenseConfirmed,
          }
        : null,
    },
    clips: input.timeline.clips.map((clip, index) => {
      const line = input.dialogue.lines.find((item) => item.clipId === clip.id)
      return {
        order: index + 1,
        shotId: clip.shotId,
        shotNumber: clip.shotNumber,
        scene: clip.scene,
        sourceAssetId: clip.sourceAssetId,
        sourceHash: clip.sourceAssetId
          ? input.version.inputHashes[clip.sourceAssetId] ?? null
          : null,
        inMs: clip.inMs,
        outMs: clip.outMs,
        durationMs: Math.max(0, clip.outMs - clip.inMs),
        muted: clip.muted,
        dialogue: line
          ? {
              speaker: line.speaker,
              text: line.dialogue,
              assetId: line.assetId,
              durationMs: line.durationMs,
            }
          : null,
      }
    }),
  }
}

export async function renderClaimedVideo(
  db: DatabaseSync,
  render: VideoRender,
): Promise<VideoRender> {
  try {
    const prepared = inspectVersion(db, render.projectId, render.timelineVersionId)
    if (prepared.issues.length > 0) {
      throw new Error(prepared.issues[0].message)
    }
    updateVideoRenderProgress(db, render.id, 8)
    const videoAssets = prepared.timeline.clips.map((clip) =>
      clip.sourceAssetId
        ? getGeneratedAsset(db, clip.sourceAssetId, render.projectId)
        : null
    )
    if (videoAssets.some((asset) => !asset)) {
      throw new Error("有镜头视频素材在排队期间被删除")
    }
    const firstProbe = await probeMedia(
      resolveGeneratedStoragePath(videoAssets[0]!.storageKey),
    )
    const width = firstProbe.width && firstProbe.height
      ? firstProbe.width
      : 1080
    const height = firstProbe.width && firstProbe.height
      ? firstProbe.height
      : 1920
    const totalDurationMs = prepared.timeline.clips.reduce(
      (sum, clip) => sum + Math.max(0, clip.outMs - clip.inMs),
      0,
    )
    if (totalDurationMs <= 0) throw new Error("时间线总时长必须大于 0")

    const inputPaths: string[] = videoAssets.map((asset) =>
      resolveGeneratedStoragePath(asset!.storageKey)
    )
    const lineByClip = new Map(prepared.dialogue.lines.map((line) => [line.clipId, line]))
    const dialogueInputs: Array<{
      inputIndex: number
      startMs: number
      volume: number
    }> = []
    for (const clip of prepared.timeline.clips) {
      const line = lineByClip.get(clip.id)
      if (!line || line.muted || !line.storageKey) continue
      dialogueInputs.push({
        inputIndex: inputPaths.length,
        startMs: line.startMs,
        volume: clip.volume,
      })
      inputPaths.push(resolveGeneratedStoragePath(line.storageKey))
    }

    const bgm = prepared.timeline.audio.bgmAssetId
      ? getBgmTrack(db, render.projectId, prepared.timeline.audio.bgmAssetId)
      : null
    let bgmInput: { inputIndex: number; volume: number } | null = null
    if (bgm) {
      bgmInput = {
        inputIndex: inputPaths.length,
        volume: prepared.timeline.audio.bgmVolume,
      }
      inputPaths.push(resolveGeneratedStoragePath(bgm.storageKey))
    }

    const outputStorageKey = `generated/${render.projectId}/renders/${render.id}/output.mp4`
    const outputPath = resolveGeneratedStoragePath(outputStorageKey)
    fs.mkdirSync(outputPath.replace(/[\\/][^\\/]+$/, ""), { recursive: true })
    updateVideoRenderProgress(db, render.id, 20)

    const command = buildFfmpegRenderArgs({
      ffmpegPath: resolveFfmpegPath(),
      outputPath,
      width,
      height,
      fps: prepared.timeline.fps,
      totalDurationMs,
      clips: prepared.timeline.clips.map((clip, index) => ({
        inputIndex: index,
        inMs: clip.inMs,
        outMs: clip.outMs,
      })),
      dialogue: dialogueInputs,
      bgm: bgmInput,
    })
    const args = [
      command[0],
      command[1],
      ...inputPaths.flatMap((path) => ["-i", path]),
      ...command.slice(2),
    ]
    await runMediaCommand(resolveFfmpegPath(), args)
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error("FFmpeg 没有生成可播放的 MP4")
    }
    const outputProbe = await probeMedia(outputPath)
    if (!outputProbe.durationMs || outputProbe.durationMs < 500) {
      throw new Error("渲染产物的视频时长无效")
    }
    updateVideoRenderProgress(db, render.id, 82)

    const srt = buildTimelineSrt({
      timeline: prepared.timeline,
      shots: prepared.shots,
    })
    const srtFile = writeGeneratedArtifact(
      render.projectId,
      `renders/${render.id}/output.srt`,
      new TextEncoder().encode(srt),
      5 * 1024 * 1024,
      true,
    )
    const manifest = manifestFor({
      render,
      version: prepared.version,
      timeline: prepared.timeline,
      dialogue: prepared.dialogue,
      width,
      height,
      durationMs: outputProbe.durationMs,
      bgm,
    })
    const manifestFile = writeGeneratedArtifact(
      render.projectId,
      `renders/${render.id}/manifest.json`,
      new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
      5 * 1024 * 1024,
    )
    updateVideoRenderProgress(db, render.id, 96)
    const completed = completeVideoRender(db, render.id, {
      durationMs: outputProbe.durationMs,
      videoStorageKey: outputStorageKey,
      srtStorageKey: srtFile.storageKey,
      manifestStorageKey: manifestFile.storageKey,
    })
    void notifyRenderFinished(db, completed, "succeeded").catch(() => undefined)
    return completed
  } catch (error) {
    const failed = failVideoRender(db, render.id, publicRenderError(error))
    void notifyRenderFinished(db, failed, "failed").catch(() => undefined)
    return failed
  }
}

export function readRenderArtifact(
  db: DatabaseSync,
  projectId: string,
  id: string,
  kind: "video" | "srt" | "manifest",
): { bytes: Uint8Array; mime: string; filename: string } | null {
  const render = getVideoRender(db, projectId, id)
  if (!render || render.status !== "succeeded") return null
  const storageKey = kind === "video"
    ? render.videoStorageKey
    : kind === "srt"
      ? render.srtStorageKey
      : render.manifestStorageKey
  if (!storageKey) return null
  return {
    bytes: readGeneratedAsset(storageKey),
    mime: kind === "video"
      ? "video/mp4"
      : kind === "srt"
        ? "application/x-subrip; charset=utf-8"
        : "application/json; charset=utf-8",
    filename: kind === "video"
      ? `episode-${render.episode}.mp4`
      : kind === "srt"
        ? `episode-${render.episode}.srt`
        : `episode-${render.episode}-manifest.json`,
  }
}
