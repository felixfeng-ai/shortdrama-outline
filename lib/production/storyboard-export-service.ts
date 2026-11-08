import fs from "node:fs"
import path from "node:path"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { latestSnapshot } from "../assets/repo.ts"
import type { Shot } from "../assets/types.ts"
import { listGeneratedAssets } from "../generation/repo.ts"
import { writeGeneratedArtifact, resolveGeneratedStoragePath } from "../generation/files.ts"
import type { GeneratedAsset } from "../generation/types.ts"
import { listVoiceCharacters, listVoiceProfiles, upsertVoiceProfile } from "../audio/repo.ts"
import { createAndSynthesizeShotTts } from "../audio/tts-tasks.ts"
import { getMiniMaxSpeechAvailability, getMiniMaxSpeechConfig } from "../audio/tts-model.ts"
import { recommendSystemBgmTracks } from "../audio/system-bgm.ts"
import { withQuotaReservation } from "../quota.ts"
import { quotaUnitsForCostMicros } from "../model-pricing.ts"
import { buildFfmpegRenderArgs, resolveFfmpegPath, runMediaCommand } from "../video/render-engine.ts"
import { buildStoryboardPreviewPlan } from "./storyboard-preview.ts"
import { selectedShotMedia } from "./selected-media.ts"
import { buildStoryboardSrt } from "./storyboard-export.ts"

interface RenderStoryboardExportInput {
  db: DatabaseSync
  projectId: string
  exportId: string
  identity: string
  includeNarration: boolean
  includeBgm: boolean
  signal?: AbortSignal
  width?: number
  height?: number
  fps?: number
}

interface RenderResult {
  videoStorageKey: string
  srtStorageKey: string
  durationMs: number
  narrationCount: number
  bgmTrackId: string | null
  subtitleMode: "burned" | "sidecar"
  warning: string | null
}

function subtitlePath(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'")
}

function generatedProjectRoot(projectId: string): string {
  return path.dirname(resolveGeneratedStoragePath(`generated/${projectId}/placeholder`))
}

async function normalizeImageSegment(
  inputPath: string,
  outputPath: string,
  durationSeconds: number,
  width: number,
  height: number,
  fps: number,
): Promise<void> {
  const frames = Math.max(1, Math.round(durationSeconds * fps))
  await runMediaCommand(resolveFfmpegPath(), [
    "-hide_banner", "-y",
    "-loop", "1",
    "-i", inputPath,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=increase,`
      + `crop=${width}:${height},`
      + `zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':`
      + `d=${frames}:s=${width}x${height}:fps=${fps},setsar=1,format=yuv420p`,
    "-t", String(durationSeconds),
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    outputPath,
  ])
}

async function normalizeVideoSegment(
  inputPath: string,
  outputPath: string,
  durationSeconds: number,
  width: number,
  height: number,
  fps: number,
): Promise<void> {
  await runMediaCommand(resolveFfmpegPath(), [
    "-hide_banner", "-y",
    "-i", inputPath,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=increase,`
      + `crop=${width}:${height},fps=${fps},setsar=1,format=yuv420p`,
    "-t", String(durationSeconds),
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    outputPath,
  ])
}

export async function renderStoryboardExport(
  input: RenderStoryboardExportInput,
): Promise<RenderResult> {
  const snapshot = latestSnapshot(input.db, input.projectId, "shots")
  const shots = Array.isArray(snapshot?.payload) ? snapshot.payload as Shot[] : []
  const assets = listGeneratedAssets(input.db, input.projectId)
  const preview = buildStoryboardPreviewPlan({
    projectId: input.projectId,
    shots,
    assets,
  })
  if (preview.status !== "ready") {
    throw new InputError("动态分镜尚未达到 30 秒，暂时不能导出")
  }

  const selected = selectedShotMedia(shots, assets)
  const width = Math.max(180, Math.floor(input.width ?? 540))
  const height = Math.max(320, Math.floor(input.height ?? 960))
  const fps = Math.max(8, Math.floor(input.fps ?? 24))
  const root = path.join(generatedProjectRoot(input.projectId), "storyboard-export", input.exportId)
  fs.mkdirSync(root, { recursive: true })
  const normalizedPaths: string[] = []
  const warnings: string[] = []
  let narrationCount = 0

  try {
    for (let index = 0; index < preview.segments.length; index += 1) {
      const segment = preview.segments[index]
      const media = selected.get(segment.shotId)
      const asset = media?.video ?? media?.image
      if (!asset) throw new InputError("动态分镜素材已变化，请刷新后重试")
      const output = path.join(root, `segment-${String(index + 1).padStart(2, "0")}.mp4`)
      if (segment.mediaKind === "video") {
        await normalizeVideoSegment(
          resolveGeneratedStoragePath(asset.storageKey),
          output,
          segment.durationSeconds,
          width,
          height,
          fps,
        )
      } else {
        await normalizeImageSegment(
          resolveGeneratedStoragePath(asset.storageKey),
          output,
          segment.durationSeconds,
          width,
          height,
          fps,
        )
      }
      normalizedPaths.push(output)
    }

    const narrationAssets: Array<{ asset: GeneratedAsset; segmentIndex: number }> = []
    if (input.includeNarration) {
      const availability = getMiniMaxSpeechAvailability()
      if (!availability.enabled) {
        warnings.push(availability.reason ?? "自动配音未启用")
      } else {
        const config = getMiniMaxSpeechConfig()
        const characters = listVoiceCharacters(input.db, input.projectId)
        const profiles = listVoiceProfiles(input.db, input.projectId)
        const defaultVoices = ["storyteller-female", "storyteller-male", "warm-female", "steady-male"]
        for (let index = 0; index < preview.segments.length; index += 1) {
          const segment = preview.segments[index]
          if (!segment.dialogue.trim() || !segment.speaker.trim()) continue
          const character = characters.find((item) => item.name === segment.speaker)
          if (!character) {
            warnings.push(`角色“${segment.speaker}”不在核心人物中，已跳过该句旁白`)
            continue
          }
          let profile = profiles.find((item) => item.characterEntityId === character.id)
          if (!profile) {
            profile = upsertVoiceProfile(input.db, input.projectId, character.id, {
              voiceId: defaultVoices[index % defaultVoices.length],
              speed: 1,
              volume: 1,
            })
            profiles.push(profile)
          }
          try {
            const estimatedCost = Math.ceil(
              segment.dialogue.replace(/\s/g, "").length / 1_000
                * config.pricePer1kCharsMicros,
            )
            const units = quotaUnitsForCostMicros(estimatedCost)
            const result = await withQuotaReservation(
              input.db,
              input.identity,
              "audio",
              units,
              () => createAndSynthesizeShotTts(input.db, {
                projectId: input.projectId,
                shotId: segment.shotId,
                maxBudgetMicros: estimatedCost,
                idempotencyKey: `storyboard-export:${input.exportId}:${segment.shotId}`,
                signal: input.signal,
              }),
              { requestId: `storyboard-export:${input.exportId}:${segment.shotId}` },
            )
            if (result.value.asset) {
              narrationAssets.push({ asset: result.value.asset, segmentIndex: index })
              narrationCount += 1
            }
          } catch (error) {
            warnings.push(
              `第 ${segment.episode} 集第 ${segment.shot} 镜旁白未生成：`
                + (error instanceof Error ? error.message : "未知错误"),
            )
          }
        }
      }
    }

    const totalDurationMs = preview.totalDurationSeconds * 1_000
    const bgm = input.includeBgm
      ? recommendSystemBgmTracks(
          preview.segments.map((segment) => `${segment.action} ${segment.dialogue}`).join("\n"),
          1,
        )[0] ?? null
      : null
    const inputArgs: string[] = []
    for (const normalized of normalizedPaths) inputArgs.push("-i", normalized)
    for (const narration of narrationAssets) {
      inputArgs.push("-i", resolveGeneratedStoragePath(narration.asset.storageKey))
    }
    const bgmPath = bgm
      ? path.join(process.cwd(), "public", bgm.storageKey)
      : null
    if (bgmPath) inputArgs.push("-i", bgmPath)

    const srt = buildStoryboardSrt(preview.segments)
    const srtPath = path.join(root, "storyboard.srt")
    fs.writeFileSync(srtPath, srt, "utf8")
    const mixedPath = path.join(root, "mixed.mp4")
    const narrationStartByIndex = new Map<number, number>()
    let cursorMs = 0
    for (let index = 0; index < preview.segments.length; index += 1) {
      narrationStartByIndex.set(index, cursorMs)
      cursorMs += preview.segments[index].durationSeconds * 1_000
    }
    const dialogue = narrationAssets.map((narration, index) => ({
      inputIndex: normalizedPaths.length + index,
      startMs: narrationStartByIndex.get(narration.segmentIndex) ?? 0,
      volume: 0.95,
    }))
    const renderArgs = buildFfmpegRenderArgs({
      ffmpegPath: resolveFfmpegPath(),
      outputPath: mixedPath,
      width,
      height,
      fps,
      totalDurationMs,
      transition: { type: "fade", durationMs: 220 },
      clips: normalizedPaths.map((_, index) => ({
        inputIndex: index,
        inMs: 0,
        outMs: preview.segments[index].durationSeconds * 1_000,
      })),
      dialogue,
      bgm: bgmPath
        ? {
            inputIndex: normalizedPaths.length + narrationAssets.length,
            volume: 0.2,
            fadeInMs: 1_000,
            fadeOutMs: 1_800,
            ducking: dialogue.length > 0,
          }
        : null,
    })
    await runMediaCommand(resolveFfmpegPath(), [...inputArgs, ...renderArgs])

    const finalPath = path.join(root, "share.mp4")
    let subtitleMode: "burned" | "sidecar" = "sidecar"
    try {
      await runMediaCommand(resolveFfmpegPath(), [
        "-hide_banner", "-y",
        "-i", mixedPath,
        "-vf",
        `subtitles='${subtitlePath(srtPath)}':charenc=UTF-8`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "22",
        "-c:a", "copy",
        "-movflags", "+faststart",
        finalPath,
      ])
      subtitleMode = "burned"
    } catch {
      fs.copyFileSync(mixedPath, finalPath)
      warnings.push("当前运行环境无法烧录中文字幕，已保留独立 SRT 文件")
    }

    const video = writeGeneratedArtifact(
      input.projectId,
      `storyboard-exports/${input.exportId}/share.mp4`,
      fs.readFileSync(finalPath),
    )
    const subtitle = writeGeneratedArtifact(
      input.projectId,
      `storyboard-exports/${input.exportId}/storyboard.srt`,
      new TextEncoder().encode(srt),
    )
    return {
      videoStorageKey: video.storageKey,
      srtStorageKey: subtitle.storageKey,
      durationMs: totalDurationMs,
      narrationCount,
      bgmTrackId: bgm?.id ?? null,
      subtitleMode,
      warning: warnings.length > 0 ? warnings.join("；") : null,
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
