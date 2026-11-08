import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import type { DatabaseSync } from "node:sqlite"

import { latestSnapshot } from "../assets/repo.ts"
import { writeStoreZipFile } from "../archive/zip-write.ts"
import {
  readGeneratedAsset,
  resolveGeneratedStoragePath,
  writeGeneratedArtifact,
} from "../generation/files.ts"
import {
  probeMedia,
  resolveFfmpegPath,
  runMediaCommand,
} from "../video/render-engine.ts"
import { getVideoRender } from "../video/render-repo.ts"
import {
  buildPublishMetadata,
  deliveryPlatformProfile,
  validatePublishReadiness,
} from "./platforms.ts"
import {
  completeDeliveryPackage,
  failDeliveryPackage,
  getDeliveryPackageById,
  listDeliveryItems,
  markDeliveryItemRunning,
  updateDeliveryItem,
  updateDeliveryPackageProgress,
} from "./repo.ts"
import {
  buildPublishAss,
  type PublishSubtitleStyle,
} from "./subtitles.ts"

const MAX_PACKAGE_BYTES = 3 * 1024 * 1024 * 1024
let subtitleSupport: boolean | null = null

function episodeCode(episode: number): string {
  return `S01E${String(Math.max(1, episode)).padStart(2, "0")}`
}

function publicBuildError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "交付包生成失败"
  return raw.replace(/[A-Za-z]:\\[^\n]+/g, "[本地路径]").slice(-2_000)
}

function subtitleStyleFor(db: DatabaseSync, timelineVersionId: string): PublishSubtitleStyle {
  const row = db.prepare(
    "SELECT payload_json FROM timeline_versions WHERE id = ?",
  ).get(timelineVersionId) as { payload_json: string } | undefined
  if (!row) return "clean"
  try {
    const payload = JSON.parse(row.payload_json) as {
      subtitle?: { style?: string }
    }
    return payload.subtitle?.style === "cinematic" || payload.subtitle?.style === "bold"
      ? payload.subtitle.style
      : "clean"
  } catch {
    return "clean"
  }
}

function episodeTitleFor(projectId: string, episode: number, db: DatabaseSync): string {
  const snapshot = latestSnapshot(db, projectId, "episodes")
  if (!snapshot || !Array.isArray(snapshot.payload)) return ""
  const found = snapshot.payload.find((item) =>
    Boolean(item)
    && typeof item === "object"
    && Number((item as Record<string, unknown>).episode) === episode
  ) as Record<string, unknown> | undefined
  return typeof found?.title === "string" ? found.title.trim() : ""
}

function assertSubtitleBurnSupport(): void {
  if (subtitleSupport !== null) {
    if (!subtitleSupport) throw new Error("当前 FFmpeg 不支持 ASS 字幕烧录")
    return
  }
  const result = spawnSync(resolveFfmpegPath(), ["-hide_banner", "-filters"], {
    encoding: "utf8",
    windowsHide: true,
  })
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  subtitleSupport = result.status === 0
    && /\bass\b/.test(output)
    && /\bsubtitles\b/.test(output)
  if (!subtitleSupport) throw new Error("当前 FFmpeg 缺少 libass，不能生成发布版字幕")
}

function filterPath(filePath: string): string {
  return filePath
    .replaceAll("\\", "/")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'")
}

async function burnSubtitle(
  inputPath: string,
  assPath: string,
  outputPath: string,
): Promise<void> {
  assertSubtitleBurnSupport()
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await runMediaCommand(resolveFfmpegPath(), [
    "-hide_banner",
    "-y",
    "-i",
    inputPath,
    "-vf",
    `ass=filename='${filterPath(assPath)}'`,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ])
}

async function makeCover(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
  durationMs: number,
): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const seekSeconds = Math.max(0, Math.min(1, durationMs / 2_000))
  await runMediaCommand(resolveFfmpegPath(), [
    "-hide_banner",
    "-y",
    "-ss",
    seekSeconds.toFixed(3),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
    "-q:v",
    "2",
    outputPath,
  ])
}

function artifactPath(storageKey: string | null): string {
  if (!storageKey) throw new Error("交付包缺少必要文件")
  return resolveGeneratedStoragePath(storageKey)
}

export async function buildDeliveryPackage(
  db: DatabaseSync,
  packageId: string,
): Promise<void> {
  const pkg = getDeliveryPackageById(db, packageId)
  if (!pkg) return
  const profile = deliveryPlatformProfile(pkg.platform)
  try {
    updateDeliveryPackageProgress(db, pkg.id, 3)
    const project = db.prepare(
      "SELECT title FROM projects WHERE id = ?",
    ).get(pkg.projectId) as { title: string } | undefined
    if (!project) throw new Error("交付包所属项目不存在")
    const items = listDeliveryItems(db, pkg.id)
    const manifestItems: Record<string, unknown>[] = []

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      markDeliveryItemRunning(db, pkg.id, item.id)
      const render = getVideoRender(db, pkg.projectId, item.renderId)
      if (!render || render.status !== "succeeded") {
        throw new Error(`第 ${item.episode} 集渲染版本不可用`)
      }
      if (!render.videoStorageKey || !render.srtStorageKey || !render.durationMs) {
        throw new Error(`第 ${item.episode} 集成片缺少视频、字幕或时长`)
      }
      const code = episodeCode(item.episode)
      const folder = `${code}`
      const sourceVideoPath = artifactPath(render.videoStorageKey)
      const sourceSrt = new TextDecoder().decode(readGeneratedAsset(render.srtStorageKey))
      const style = subtitleStyleFor(db, render.timelineVersionId)
      const ass = buildPublishAss({
        srt: sourceSrt,
        style,
        width: profile.width,
        height: profile.height,
      })
      const assFile = writeGeneratedArtifact(
        pkg.projectId,
        `delivery/${pkg.id}/${folder}/${code}.ass`,
        new TextEncoder().encode(ass),
        5 * 1024 * 1024,
      )
      const assPath = artifactPath(assFile.storageKey)

      const publishKey = `generated/${pkg.projectId}/delivery/${pkg.id}/${folder}/${code}-publish.mp4`
      const publishPath = resolveGeneratedStoragePath(publishKey)
      const shouldBurn = pkg.subtitleMode === "burned" || pkg.subtitleMode === "both"
      if (shouldBurn) {
        await burnSubtitle(sourceVideoPath, assPath, publishPath)
      }

      const coverKey = `generated/${pkg.projectId}/delivery/${pkg.id}/${folder}/${code}-cover.jpg`
      const coverPath = resolveGeneratedStoragePath(coverKey)
      await makeCover(
        sourceVideoPath,
        coverPath,
        profile.width,
        profile.height,
        render.durationMs,
      )
      const effectivePublishPath = shouldBurn ? publishPath : sourceVideoPath
      const probe = await probeMedia(effectivePublishPath)
      const publishSize = fs.statSync(effectivePublishPath).size
      const episodeTitle = episodeTitleFor(pkg.projectId, item.episode, db)
      const metadata = buildPublishMetadata({
        projectTitle: project.title,
        episode: item.episode,
        episodeTitle,
        durationMs: probe.durationMs ?? render.durationMs,
        width: probe.width ?? profile.width,
        height: probe.height ?? profile.height,
        sizeBytes: publishSize,
        subtitleMode: pkg.subtitleMode,
        coverAvailable: true,
      })
      const readiness = validatePublishReadiness(profile, metadata)
      const metadataFile = writeGeneratedArtifact(
        pkg.projectId,
        `delivery/${pkg.id}/${folder}/metadata.json`,
        new TextEncoder().encode(`${JSON.stringify({
          ...metadata,
          platform: profile,
          readiness,
        }, null, 2)}\n`),
        5 * 1024 * 1024,
      )
      updateDeliveryItem(db, item.id, {
        status: "ready",
        cleanVideoKey: render.videoStorageKey,
        publishVideoKey: shouldBurn ? publishKey : render.videoStorageKey,
        srtKey: render.srtStorageKey,
        assKey: assFile.storageKey,
        coverKey,
        metadataJson: JSON.stringify({ ...metadata, platform: profile, readiness }),
      })
      manifestItems.push({
        episode: item.episode,
        episodeCode: code,
        episodeTitle,
        renderId: render.id,
        timelineRevision: render.timelineRevision,
        cleanVideoKey: render.videoStorageKey,
        publishVideoKey: shouldBurn ? publishKey : render.videoStorageKey,
        srtKey: render.srtStorageKey,
        assKey: assFile.storageKey,
        coverKey,
        metadataKey: metadataFile.storageKey,
        readiness,
      })
      updateDeliveryPackageProgress(db, pkg.id, 5 + Math.round(((index + 1) / items.length) * 65))
    }

    const disclosure = [
      "AI 生成内容声明",
      "",
      "本项目包含由人工智能生成或辅助生成的内容。",
      "发布前请人工复核事实、版权、肖像权和目标平台规则，并按平台要求完成 AI 内容标识。",
      "",
    ].join("\n")
    const disclosureFile = writeGeneratedArtifact(
      pkg.projectId,
      `delivery/${pkg.id}/ai-disclosure.txt`,
      new TextEncoder().encode(disclosure),
      1024 * 1024,
    )
    const profileFile = writeGeneratedArtifact(
      pkg.projectId,
      `delivery/${pkg.id}/platform-profile.json`,
      new TextEncoder().encode(`${JSON.stringify(profile, null, 2)}\n`),
      1024 * 1024,
    )
    const checklist = [
      `# ${pkg.title} · ${profile.label} 发布清单`,
      "",
      "1. 播放 publish.mp4，确认字幕、声音和片尾无误。",
      "2. 核对封面、标题、简介、话题标签和 AI 内容声明。",
      "3. 登录目标平台官方创作后台，上传对应文件。",
      "4. 发布后回到交付中心回填作品链接。",
      "5. 按天或按周补充播放与互动数据。",
      "",
    ].join("\n")
    const checklistFile = writeGeneratedArtifact(
      pkg.projectId,
      `delivery/${pkg.id}/publish-checklist.md`,
      new TextEncoder().encode(checklist),
      1024 * 1024,
    )
    const manifest = {
      schema: "veyaframe.delivery-package",
      schemaVersion: 1,
      packageId: pkg.id,
      projectId: pkg.projectId,
      projectTitle: project.title,
      title: pkg.title,
      scope: pkg.scope,
      platform: profile,
      subtitleMode: pkg.subtitleMode,
      generatedAt: new Date().toISOString(),
      aiGenerated: true,
      totalQuotaUnits: pkg.totalQuotaUnits,
      items: manifestItems,
    }
    const manifestFile = writeGeneratedArtifact(
      pkg.projectId,
      `delivery/${pkg.id}/manifest.json`,
      new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
      10 * 1024 * 1024,
    )

    const zipEntries = [
      { name: "manifest.json", path: artifactPath(manifestFile.storageKey) },
      { name: "ai-disclosure.txt", path: artifactPath(disclosureFile.storageKey) },
      { name: "platform-profile.json", path: artifactPath(profileFile.storageKey) },
      { name: "publish-checklist.md", path: artifactPath(checklistFile.storageKey) },
    ]
    if (pkg.scope === "series") {
      zipEntries.push({ name: "series-manifest.json", path: artifactPath(manifestFile.storageKey) })
    }
    const readyItems = listDeliveryItems(db, pkg.id)
    for (const item of readyItems) {
      const code = episodeCode(item.episode)
      zipEntries.push(
        { name: `${code}/${code}-clean.mp4`, path: artifactPath(item.cleanVideoKey) },
        { name: `${code}/${code}-publish.mp4`, path: artifactPath(item.publishVideoKey) },
        { name: `${code}/${code}.srt`, path: artifactPath(item.srtKey) },
        { name: `${code}/${code}.ass`, path: artifactPath(item.assKey) },
        { name: `${code}/${code}-cover.jpg`, path: artifactPath(item.coverKey) },
      )
      const metadataPath = resolveGeneratedStoragePath(
        `generated/${pkg.projectId}/delivery/${pkg.id}/${code}/metadata.json`,
      )
      zipEntries.push({ name: `${code}/metadata.json`, path: metadataPath })
    }
    const totalBytes = zipEntries.reduce((sum, entry) => sum + fs.statSync(entry.path).size, 0)
    if (totalBytes > MAX_PACKAGE_BYTES) throw new Error("交付包总大小超过 3GB，请拆成更小的整季包")
    const packageKey = `generated/${pkg.projectId}/delivery/${pkg.id}/package.zip`
    const packagePath = resolveGeneratedStoragePath(packageKey)
    updateDeliveryPackageProgress(db, pkg.id, 80)
    writeStoreZipFile(packagePath, zipEntries)
    if (!fs.existsSync(packagePath) || fs.statSync(packagePath).size === 0) {
      throw new Error("交付包 ZIP 没有生成有效文件")
    }
    completeDeliveryPackage(db, pkg.id, {
      packageStorageKey: packageKey,
      manifestStorageKey: manifestFile.storageKey,
    })
  } catch (error) {
    for (const item of listDeliveryItems(db, pkg.id)) {
      if (item.status !== "ready") {
        updateDeliveryItem(db, item.id, { status: "failed", error: publicBuildError(error) })
      }
    }
    failDeliveryPackage(db, pkg.id, publicBuildError(error))
  }
}
