import { test } from "node:test"
import assert from "node:assert/strict"

import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createDeliveryPackage } from "../lib/delivery/repo.ts"
import { createDeliveryReviewLink } from "../lib/delivery/review.ts"
import {
  completeVideoRender,
  createVideoRender,
} from "../lib/video/render-repo.ts"
import { GET as getReview } from "../app/api/reviews/[token]/route.ts"
import { POST as postFeedback } from "../app/api/reviews/[token]/feedback/route.ts"
import { POST as postDecision } from "../app/api/reviews/[token]/decision/route.ts"
import { POST as postPublish } from "../app/api/video/delivery-packages/[id]/publish-records/route.ts"
import { POST as postMetric } from "../app/api/video/publish-records/[id]/metrics/route.ts"

function seedReadyPackage() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "API 交付测试", "local")
  const render = createVideoRender(db, {
    projectId: project.id,
    episode: 1,
    timelineVersionId: "timeline-api",
    timelineRevision: 1,
    qualityProfile: "delivery",
    exportPreset: "vertical",
  })
  completeVideoRender(db, render.id, {
    durationMs: 7_000,
    videoStorageKey: `generated/${project.id}/api.mp4`,
    srtStorageKey: `generated/${project.id}/api.srt`,
    manifestStorageKey: `generated/${project.id}/api.json`,
  })
  const pkg = createDeliveryPackage(db, {
    projectId: project.id,
    title: "API 发布包",
    scope: "episode",
    platform: "douyin",
    subtitleMode: "both",
    items: [{ episode: 1, renderId: render.id }],
  })
  db.prepare("UPDATE video_delivery_packages SET status = 'ready' WHERE id = ?").run(pkg.id)
  db.prepare("UPDATE video_delivery_items SET status = 'ready' WHERE package_id = ?").run(pkg.id)
  const item = db.prepare("SELECT id FROM video_delivery_items WHERE package_id = ?")
    .get(pkg.id) as { id: string }
  const review = createDeliveryReviewLink(db, {
    packageId: pkg.id,
    reviewerName: "王导演",
    roleLabel: "导演",
    ttlMs: 60_000,
  })
  return { db, project, pkg, item, review }
}

test("DELIVERY-API1 公开审片只返回交付内容，不泄露成本和内部键", async () => {
  const { review, pkg } = seedReadyPackage()
  const response = await getReview(
    new Request(`http://localhost/api/reviews/${review.token}`),
    { params: Promise.resolve({ token: review.token }) },
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.success, true)
  assert.equal(payload.data.package.id, pkg.id)
  assert.equal(payload.data.items.length, 1)
  assert.doesNotMatch(JSON.stringify(payload.data), /totalQuotaUnits|projectId|storageKey|renderId/)
})

test("DELIVERY-API2 审片批注和结论通过 Token 写回", async () => {
  const { review, item } = seedReadyPackage()
  const feedback = await postFeedback(
    new Request(`http://localhost/api/reviews/${review.token}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        timestampMs: 1_200,
        body: "这里需要换一个转场",
      }),
    }),
    { params: Promise.resolve({ token: review.token }) },
  )
  assert.equal(feedback.status, 201)
  const decision = await postDecision(
    new Request(`http://localhost/api/reviews/${review.token}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "changes_requested", note: "调整转场" }),
    }),
    { params: Promise.resolve({ token: review.token }) },
  )
  assert.equal(decision.status, 201)
  const payload = await decision.json()
  assert.equal(payload.data.decision.decision, "changes_requested")
})

test("DELIVERY-API3 发布记录和指标接口要求项目归属", async () => {
  const { project, pkg, item } = seedReadyPackage()
  const publish = await postPublish(
    new Request(`http://localhost/api/video/delivery-packages/${pkg.id}/publish-records`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        itemId: item.id,
        platform: "douyin",
        status: "published",
        publishedUrl: "https://example.com/video/api",
      }),
    }),
    { params: Promise.resolve({ id: pkg.id }) },
  )
  assert.equal(publish.status, 201)
  const payload = await publish.json()
  const recordId = payload.data.record.id as string
  const metric = await postMetric(
    new Request(`http://localhost/api/video/publish-records/${recordId}/metrics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        packageId: pkg.id,
        views: 1_000,
        views3s: 500,
        completionRate: 0.3,
        costUnits: 2,
      }),
    }),
    { params: Promise.resolve({ id: recordId }) },
  )
  assert.equal(metric.status, 201)
  const metricPayload = await metric.json()
  assert.equal(metricPayload.data.summary.totalViews, 1_000)
  assert.equal(metricPayload.data.summary.costPerThousandViews, 2)
})
