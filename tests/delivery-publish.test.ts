import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  createDeliveryPackage,
  listDeliveryItems,
} from "../lib/delivery/repo.ts"
import {
  addPublishMetric,
  createPublishRecord,
  getPublishSummary,
} from "../lib/delivery/publish.ts"
import { getProjectDeliverySummary } from "../lib/delivery/ledger.ts"
import {
  completeVideoRender,
  createVideoRender,
} from "../lib/video/render-repo.ts"

test("DELIVERY-PUBLISH1 发布记录和指标进入交付汇总", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "发布项目", "owner-publish")
    const render = createVideoRender(db, {
      projectId: project.id,
      episode: 1,
      timelineVersionId: "timeline-publish",
      timelineRevision: 1,
      qualityProfile: "delivery",
      exportPreset: "vertical",
    })
    completeVideoRender(db, render.id, {
      durationMs: 7_000,
      videoStorageKey: `generated/${project.id}/publish.mp4`,
      srtStorageKey: `generated/${project.id}/publish.srt`,
      manifestStorageKey: `generated/${project.id}/publish.json`,
    })
    const pkg = createDeliveryPackage(db, {
      projectId: project.id,
      title: "发布包",
      scope: "episode",
      platform: "douyin",
      subtitleMode: "both",
      items: [{ episode: 1, renderId: render.id }],
    })
    db.prepare("UPDATE video_delivery_packages SET status = 'ready' WHERE id = ?").run(pkg.id)
    db.prepare("UPDATE video_delivery_items SET status = 'ready' WHERE package_id = ?").run(pkg.id)
    const item = listDeliveryItems(db, pkg.id)[0]
    const record = createPublishRecord(db, {
      packageId: pkg.id,
      itemId: item.id,
      platform: "douyin",
      status: "published",
      publishedUrl: "https://example.com/video/1",
      publishedAt: 1_700_000_000_000,
      note: "首集发布",
    })
    addPublishMetric(db, {
      publishRecordId: record.id,
      capturedAt: 1_700_000_100_000,
      views: 10_000,
      views3s: 6_000,
      completionRate: 0.35,
      likes: 500,
      comments: 80,
      shares: 40,
      costUnits: 8,
    })
    const summary = getPublishSummary(db, pkg.id)
    assert.equal(summary.publishedItems, 1)
    assert.equal(summary.totalViews, 10_000)
    assert.equal(summary.weightedRetention3s, 0.6)
    assert.equal(summary.completionRate, 0.35)
    assert.equal(summary.costPerThousandViews, 0.8)
    const projectSummary = getProjectDeliverySummary(db, project.id)
    assert.equal(projectSummary.publishedEpisodes, 1)
    assert.equal(projectSummary.totalViews, 10_000)
    assert.equal(projectSummary.costPerThousandViews, 0.8)
  } finally {
    db.close()
  }
})

