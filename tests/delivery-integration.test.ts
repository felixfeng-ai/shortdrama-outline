import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { readStoreZip } from "../lib/archive/zip.ts"
import {
  buildDeliveryPackage,
} from "../lib/delivery/service.ts"
import {
  createDeliveryPackage,
  getDeliveryPackage,
  listDeliveryItems,
} from "../lib/delivery/repo.ts"
import {
  readGeneratedAsset,
  resolveGeneratedStoragePath,
  writeGeneratedArtifact,
} from "../lib/generation/files.ts"
import {
  probeMedia,
  resolveFfmpegPath,
  runMediaCommand,
} from "../lib/video/render-engine.ts"
import {
  completeVideoRender,
  createVideoRender,
} from "../lib/video/render-repo.ts"

test("DELIVERY-INT1 真实 FFmpeg 烧录字幕并生成可读取 ZIP", { timeout: 60_000 }, async () => {
  const db = openDb(":memory:")
  const project = createProject(db, "发布包集成测试", "owner-delivery-int")
  try {
    const videoKey = `generated/${project.id}/delivery-source.mp4`
    const videoPath = resolveGeneratedStoragePath(videoKey)
    fs.mkdirSync(resolveGeneratedStoragePath(`generated/${project.id}/placeholder`).replace(/[\\/]placeholder$/, ""), {
      recursive: true,
    })
    await runMediaCommand(resolveFfmpegPath(), [
      "-hide_banner", "-y",
      "-f", "lavfi", "-i", "color=c=blue:s=320x568:r=30:d=2",
      "-f", "lavfi", "-i", "sine=frequency=220:duration=2",
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", videoPath,
    ])
    const srt = [
      "1",
      "00:00:00,300 --> 00:00:01,700",
      "发布版字幕",
      "",
    ].join("\r\n")
    const srtFile = writeGeneratedArtifact(
      project.id,
      "delivery-test/output.srt",
      new TextEncoder().encode(srt),
    )
    const manifestFile = writeGeneratedArtifact(
      project.id,
      "delivery-test/render.json",
      new TextEncoder().encode("{}\n"),
    )
    const render = createVideoRender(db, {
      projectId: project.id,
      episode: 1,
      timelineVersionId: "timeline-delivery-int",
      timelineRevision: 1,
      qualityProfile: "delivery",
      exportPreset: "vertical",
    })
    completeVideoRender(db, render.id, {
      durationMs: 2_000,
      videoStorageKey: videoKey,
      srtStorageKey: srtFile.storageKey,
      manifestStorageKey: manifestFile.storageKey,
    })
    const pkg = createDeliveryPackage(db, {
      projectId: project.id,
      title: "第一集发布包",
      scope: "episode",
      platform: "douyin",
      subtitleMode: "both",
      items: [{ episode: 1, renderId: render.id }],
    })

    await buildDeliveryPackage(db, pkg.id)

    const built = getDeliveryPackage(db, project.id, pkg.id)
    assert.equal(built?.status, "ready", built?.error ?? undefined)
    const item = listDeliveryItems(db, pkg.id)[0]
    assert.equal(item.status, "ready")
    assert.ok(item.publishVideoKey)
    assert.ok(item.coverKey)
    assert.ok(item.assKey)
    const probe = await probeMedia(resolveGeneratedStoragePath(item.publishVideoKey))
    assert.ok((probe.durationMs ?? 0) >= 1_800)
    assert.match(new TextDecoder().decode(readGeneratedAsset(item.assKey)), /发布版字幕/)
    assert.ok(fs.statSync(resolveGeneratedStoragePath(item.publishVideoKey)).size > 1_000)

    assert.ok(built?.packageStorageKey)
    const zipBytes = fs.readFileSync(resolveGeneratedStoragePath(built.packageStorageKey))
    const entries = await readStoreZip(new Blob([zipBytes]))
    assert.ok(entries.has("manifest.json"))
    assert.ok(entries.has("S01E01/S01E01-publish.mp4"))
    assert.ok(entries.has("S01E01/S01E01-cover.jpg"))
    assert.ok(entries.has("S01E01/metadata.json"))
  } finally {
    db.close()
  }
})
