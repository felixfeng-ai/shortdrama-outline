import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { createDeliveryPackage } from "../lib/delivery/repo.ts"
import {
  createDeliveryReviewLink,
  resolveDeliveryReviewToken,
  submitDeliveryReview,
} from "../lib/delivery/review.ts"
import {
  completeVideoRender,
  createVideoRender,
} from "../lib/video/render-repo.ts"

function readyPackage(db: ReturnType<typeof openDb>) {
  const project = createProject(db, "审片项目", "owner-review")
  const render = createVideoRender(db, {
    projectId: project.id,
    episode: 1,
    timelineVersionId: "timeline-review",
    timelineRevision: 1,
    qualityProfile: "delivery",
    exportPreset: "vertical",
  })
  completeVideoRender(db, render.id, {
    durationMs: 7_000,
    videoStorageKey: `generated/${project.id}/review.mp4`,
    srtStorageKey: `generated/${project.id}/review.srt`,
    manifestStorageKey: `generated/${project.id}/review.json`,
  })
  const pkg = createDeliveryPackage(db, {
    projectId: project.id,
    title: "第一集审片",
    scope: "episode",
    platform: "douyin",
    subtitleMode: "both",
    items: [{ episode: 1, renderId: render.id }],
  })
  db.prepare("UPDATE video_delivery_packages SET status = 'ready' WHERE id = ?").run(pkg.id)
  return { project, pkg }
}

test("DELIVERY-REVIEW1 Token 只存哈希，可解析但数据库没有原文", () => {
  const db = openDb(":memory:")
  try {
    const { pkg } = readyPackage(db)
    const created = createDeliveryReviewLink(db, {
      packageId: pkg.id,
      reviewerName: "王导演",
      roleLabel: "导演",
      ttlMs: 60_000,
    })
    assert.ok(created.token.length >= 32)
    const row = db.prepare("SELECT token_hash FROM video_delivery_review_links WHERE id = ?")
      .get(created.link.id) as { token_hash: string }
    assert.notEqual(row.token_hash, created.token)
    assert.equal(resolveDeliveryReviewToken(db, created.token)?.package.id, pkg.id)
  } finally {
    db.close()
  }
})

test("DELIVERY-REVIEW2 过期链接无法访问，审核结论写回交付包", () => {
  const db = openDb(":memory:")
  try {
    const { pkg } = readyPackage(db)
    const expired = createDeliveryReviewLink(db, {
      packageId: pkg.id,
      reviewerName: "客户 A",
      roleLabel: "客户",
      ttlMs: 60_000,
    })
    db.prepare("UPDATE video_delivery_review_links SET expires_at = ? WHERE id = ?")
      .run(Date.now() - 1, expired.link.id)
    assert.equal(resolveDeliveryReviewToken(db, expired.token), null)

    const active = createDeliveryReviewLink(db, {
      packageId: pkg.id,
      reviewerName: "李制片",
      roleLabel: "制片",
      ttlMs: 60_000,
    })
    const decision = submitDeliveryReview(db, {
      token: active.token,
      decision: "changes_requested",
      note: "第 3 秒转场需要调整",
    })
    assert.equal(decision.decision, "changes_requested")
    const status = db.prepare("SELECT review_status FROM video_delivery_packages WHERE id = ?")
      .get(pkg.id) as { review_status: string }
    assert.equal(status.review_status, "changes_requested")
  } finally {
    db.close()
  }
})

