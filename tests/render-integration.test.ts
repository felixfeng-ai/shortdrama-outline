import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { saveBgmTrack } from "../lib/audio/bgm-repo.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"
import {
  freezeTimelineVersion,
  initializeEpisodeTimeline,
} from "../lib/timeline/repo.ts"
import {
  probeMedia,
  resolveFfmpegPath,
  runMediaCommand,
} from "../lib/video/render-engine.ts"
import { drainVideoRenderQueue } from "../lib/video/render-queue.ts"
import { getVideoRender } from "../lib/video/render-repo.ts"
import {
  enqueueEpisodeRender,
  readRenderArtifact,
} from "../lib/video/render-service.ts"

async function makeVideo(file: string, color: string, durationSeconds: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await runMediaCommand(resolveFfmpegPath(), [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=320x568:r=30:d=${durationSeconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=220:duration=${durationSeconds}`,
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    file,
  ])
}

async function makeAudio(file: string, frequency: number, durationSeconds: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await runMediaCommand(resolveFfmpegPath(), [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:duration=${durationSeconds}`,
    "-c:a",
    "libmp3lame",
    "-b:a",
    "64k",
    file,
  ])
}

test("P1-V5.15 两段视频、两句对白与 BGM 完成真实 FFmpeg 成片并产出三类文件", { timeout: 45_000 }, async () => {
  const db = openDb(":memory:")
  const project = createProject(db, "真实渲染", "owner-render-integration")
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [
      {
        id: "row-1",
        entityId: "shot-1",
        episode: 1,
        shot: 1,
        scene: "天台",
        speaker: "林晚",
        dialogue: "你终于来了。",
        params: { duration: 2 },
      },
      {
        id: "row-2",
        entityId: "shot-2",
        episode: 1,
        shot: 2,
        scene: "走廊",
        speaker: "周沉",
        dialogue: "我一直在。",
        params: { duration: 3 },
      },
    ],
  })

  const createdAt = Date.now()
  const addVideo = async (shotId: string, durationMs: number, color: string) => {
    const storageKey = `generated/${project.id}/source-${shotId}.mp4`
    const file = path.resolve(
      process.env.CHENGJU_GENERATED_DIR!,
      storageKey.split("/").slice(1).join(path.sep),
    )
    await makeVideo(file, color, durationMs / 1000)
    const bytes = fs.readFileSync(file)
    const task = createGenerationTask(db, {
      projectId: project.id,
      targetType: "shot",
      targetId: shotId,
      providerId: "minimax",
      model: "MiniMax-H3-Lite",
      prompt: shotId,
      mediaKind: "video",
    })
    const asset = saveGeneratedAsset(db, {
      taskId: task.id,
      projectId: project.id,
      targetType: "shot",
      targetId: shotId,
      storageKey,
      mime: "video/mp4",
      bytes: bytes.length,
      providerId: "minimax",
      model: "MiniMax-H3-Lite",
      prompt: shotId,
      mediaKind: "video",
      durationMs,
      width: 320,
      height: 568,
      fps: 30,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
    completeGenerationTask(db, task.id, asset.id)
    selectGeneratedAsset(db, project.id, asset.id)
  }
  await addVideo("shot-1", 2_000, "blue")
  await addVideo("shot-2", 3_000, "green")

  const addTts = async (shotId: string, dialogue: string, frequency: number) => {
    const storageKey = `generated/${project.id}/tts-${shotId}.mp3`
    const file = path.resolve(
      process.env.CHENGJU_GENERATED_DIR!,
      storageKey.split("/").slice(1).join(path.sep),
    )
    await makeAudio(file, frequency, 1.2)
    const bytes = fs.readFileSync(file)
    const task = createGenerationTask(db, {
      projectId: project.id,
      targetType: "shot",
      targetId: shotId,
      providerId: "minimax",
      model: "speech-02-hd",
      prompt: dialogue,
      mediaKind: "audio",
    })
    const asset = saveGeneratedAsset(db, {
      taskId: task.id,
      projectId: project.id,
      targetType: "shot",
      targetId: shotId,
      storageKey,
      mime: "audio/mpeg",
      bytes: bytes.length,
      providerId: "minimax",
      model: "speech-02-hd",
      prompt: dialogue,
      mediaKind: "audio",
      durationMs: 1_200,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
    completeGenerationTask(db, task.id, asset.id)
  }
  await addTts("shot-1", "你终于来了。", 520)
  await addTts("shot-2", "我一直在。", 660)

  const bgmStorageKey = `generated/${project.id}/bgm.mp3`
  const bgmPath = path.resolve(
    process.env.CHENGJU_GENERATED_DIR!,
    bgmStorageKey.split("/").slice(1).join(path.sep),
  )
  await makeAudio(bgmPath, 180, 2)
  const bgmBytes = fs.readFileSync(bgmPath)
  const bgm = saveBgmTrack(db, {
    id: "bgm-integration",
    projectId: project.id,
    name: "测试配乐",
    storageKey: bgmStorageKey,
    mime: "audio/mpeg",
    bytes: bgmBytes.length,
    durationMs: 2_000,
    sha256: createHash("sha256").update(bgmBytes).digest("hex"),
    licenseConfirmed: true,
    licenseNote: "测试生成",
  })

  const draft = initializeEpisodeTimeline(db, project.id, 1).draft
  draft.payload.audio.bgmAssetId = bgm.id
  db.prepare(
    "UPDATE timeline_drafts SET payload_json = ? WHERE id = ?",
  ).run(JSON.stringify(draft.payload), draft.id)
  const version = freezeTimelineVersion(db, project.id, 1, draft.revision)
  assert.ok(Object.keys(version.inputHashes).some((key) => key.startsWith("tts:shot-1:")))

  const queued = enqueueEpisodeRender(db, {
    projectId: project.id,
    episode: 1,
    timelineVersionId: version.id,
  })
  await drainVideoRenderQueue(db)

  const rendered = getVideoRender(db, project.id, queued.id)
  assert.equal(rendered?.status, "succeeded", rendered?.error ?? undefined)
  const video = readRenderArtifact(db, project.id, queued.id, "video")
  const subtitle = readRenderArtifact(db, project.id, queued.id, "srt")
  const manifest = readRenderArtifact(db, project.id, queued.id, "manifest")
  assert.ok(video && video.bytes.length > 1_000)
  assert.ok(subtitle && Buffer.from(subtitle.bytes).toString("utf8").includes("林晚：你终于来了。"))
  const manifestJson = JSON.parse(Buffer.from(manifest!.bytes).toString("utf8"))
  assert.equal(manifestJson.timelineVersionId, version.id)
  assert.equal(manifestJson.clips.length, 2)

  const outputKey = rendered!.videoStorageKey!
  const outputPath = path.resolve(
    process.env.CHENGJU_GENERATED_DIR!,
    outputKey.split("/").slice(1).join(path.sep),
  )
  const probe = await probeMedia(outputPath)
  assert.ok((probe.durationMs ?? 0) >= 4_800)
  assert.ok(rendered!.createdAt >= createdAt)
})
