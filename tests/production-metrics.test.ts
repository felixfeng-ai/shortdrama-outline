import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  buildProductionMetrics,
  readProductionMetrics,
} from "../lib/analytics/production-metrics.ts"

const NOW = Date.parse("2026-11-09T12:00:00+08:00")

function run(
  ownerId: string,
  target: "story" | "keyframe" | "video",
  status: "active" | "completed" | "failed",
  durationMs: number,
) {
  return {
    ownerId,
    target,
    status,
    createdAt: NOW - durationMs,
    updatedAt: status === "active" ? NOW - durationMs : NOW,
  }
}

test("METRIC1 空数据返回稳定空报告", () => {
  const report = buildProductionMetrics({
    runs: [],
    deliveryProjectIds: [],
    publishedProjectIds: [],
    now: NOW,
  })

  assert.equal(report.generatedAt, NOW)
  assert.deepEqual(report.quickTrial.counts, {
    total: 0,
    active: 0,
    completed: 0,
    failed: 0,
    staleActive: 0,
  })
  assert.equal(report.quickTrial.completionRate, null)
  assert.equal(report.quickTrial.firstResultMs.sampleSize, 0)
  assert.equal(report.quickTrial.firstResultMs.p50, null)
  assert.equal(report.delivery.packageRate, null)
})

test("METRIC2 快速试片按状态、目标和首次结果耗时聚合", () => {
  const report = buildProductionMetrics({
    runs: [
      run("owner_a", "story", "completed", 100_000),
      run("owner_a", "keyframe", "completed", 300_000),
      run("owner_b", "keyframe", "completed", 500_000),
      run("owner_b", "video", "failed", 200_000),
      run("owner_c", "video", "active", 10 * 60 * 1000),
      run("owner_c", "story", "active", 31 * 60 * 1000),
    ],
    deliveryProjectIds: [],
    publishedProjectIds: [],
    now: NOW,
  })

  assert.deepEqual(report.quickTrial.counts, {
    total: 6,
    active: 2,
    completed: 3,
    failed: 1,
    staleActive: 1,
  })
  assert.equal(report.quickTrial.completionRate, 0.5)
  assert.equal(report.quickTrial.failureRate, 1 / 6)
  assert.deepEqual(report.quickTrial.firstResultMs, {
    sampleSize: 3,
    p50: 300_000,
    p90: 500_000,
    max: 500_000,
  })
  assert.deepEqual(report.quickTrial.byTarget.keyframe, {
    total: 2,
    active: 0,
    completed: 2,
    failed: 0,
    staleActive: 0,
    completionRate: 1,
    firstResultMs: {
      sampleSize: 2,
      p50: 300_000,
      p90: 500_000,
      max: 500_000,
    },
  })
})

test("METRIC3 交付与发布转化以快速试片项目为分母", () => {
  const report = buildProductionMetrics({
    runs: [
      { ownerId: "owner_a", projectId: "p1", target: "story", status: "completed", createdAt: NOW - 1, updatedAt: NOW },
      { ownerId: "owner_a", projectId: "p2", target: "keyframe", status: "completed", createdAt: NOW - 1, updatedAt: NOW },
      { ownerId: "owner_b", projectId: "p3", target: "video", status: "completed", createdAt: NOW - 1, updatedAt: NOW },
      { ownerId: "owner_b", projectId: "p4", target: "video", status: "failed", createdAt: NOW - 1, updatedAt: NOW },
    ],
    deliveryProjectIds: ["p2", "p3"],
    publishedProjectIds: ["p3"],
    now: NOW,
  })

  assert.deepEqual(report.delivery, {
    projects: 4,
    withPackage: 2,
    withPublishedRecord: 1,
    packageRate: 0.5,
    publishRate: 0.25,
  })
})

test("METRIC4 从数据库读取时不泄露项目想法", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const ownerId = "owner_metrics"
  const project = createProject(db, "隐私项目", ownerId)
  db.prepare(`
    INSERT INTO project_quick_trial_runs
      (project_id, idea, phase, status, error, target, budget_units, budget_micros,
       visual_approved, video_approved, video_budget_micros, video_model,
       video_resolution, video_duration_seconds, created_at, updated_at)
    VALUES (?, ?, 'ready', 'completed', NULL, 'story', 5, 500000,
            0, 0, 0, NULL, NULL, 5, ?, ?)
  `).run(project.id, "这是不能进入报告的私有想法", NOW - 120_000, NOW)
  db.prepare(`
    INSERT INTO video_delivery_packages
      (id, project_id, title, scope, platform, subtitle_mode, status, review_status,
       progress, total_quota_units, idempotency_key, created_at, updated_at)
    VALUES ('package_metrics', ?, '第一集', 'episode', 'generic', 'both', 'ready',
            'not_requested', 100, 0, NULL, ?, ?)
  `).run(project.id, NOW - 60_000, NOW)

  const report = readProductionMetrics(db, NOW)
  const serialized = JSON.stringify(report)

  assert.equal(report.quickTrial.counts.completed, 1)
  assert.equal(report.quickTrial.firstResultMs.p50, 120_000)
  assert.equal(report.delivery.withPackage, 1)
  assert.doesNotMatch(serialized, /私有想法/)
  assert.doesNotMatch(serialized, /隐私项目/)
  assert.doesNotMatch(serialized, new RegExp(ownerId))
})

test("METRIC5 指标接口仅允许管理账号读取", async () => {
  const route = fs.readFileSync("app/api/admin/product-metrics/route.ts", "utf8")

  assert.match(route, /isUnlimitedQuotaIdentity/)
  assert.match(route, /resolveProjectOwner/)
  assert.match(route, /readProductionMetrics/)
  assert.match(route, /403/)
  assert.match(route, /force-dynamic/)

  const previous = process.env.UNLIMITED_QUOTA_ACCOUNTS
  __resetDbForTests(":memory:")
  try {
    delete process.env.UNLIMITED_QUOTA_ACCOUNTS
    const { GET } = await import("../app/api/admin/product-metrics/route.ts")
    const denied = await GET(new Request("http://localhost/api/admin/product-metrics"))
    assert.equal(denied.status, 403)

    process.env.UNLIMITED_QUOTA_ACCOUNTS = "local"
    const allowed = await GET(new Request("http://localhost/api/admin/product-metrics"))
    const payload = await allowed.json()
    assert.equal(allowed.status, 200)
    assert.equal(payload.success, true)
    assert.equal(payload.data.quickTrial.counts.total, 0)
  } finally {
    if (previous === undefined) delete process.env.UNLIMITED_QUOTA_ACCOUNTS
    else process.env.UNLIMITED_QUOTA_ACCOUNTS = previous
  }
})
