import assert from "node:assert/strict"
import test from "node:test"

import { buildOutputInventory } from "../lib/output-inventory.ts"
import type { DeliveryPackageClient } from "../lib/delivery/client.ts"
import type { VideoRenderDto } from "../lib/video/render-types.ts"

function render(overrides: Partial<VideoRenderDto>): VideoRenderDto {
  return {
    id: "render-1",
    projectId: "project-1",
    episode: 1,
    timelineVersionId: "version-1",
    timelineRevision: 1,
    qualityProfile: "preview",
    exportPreset: "vertical",
    status: "succeeded",
    progress: 100,
    error: null,
    durationMs: 10_000,
    videoUrl: "/api/video/renders/render-1/file?kind=video",
    subtitleUrl: "/api/video/renders/render-1/file?kind=srt",
    manifestUrl: "/api/video/renders/render-1/file?kind=manifest",
    quotaUnits: 2,
    createdAt: 100,
    startedAt: 90,
    finishedAt: 110,
    updatedAt: 110,
    ...overrides,
  }
}

function pkg(overrides: Partial<DeliveryPackageClient>): DeliveryPackageClient {
  return {
    id: "package-1",
    projectId: "project-1",
    title: "第一集交付包",
    scope: "episode",
    platform: "douyin",
    subtitleMode: "both",
    status: "ready",
    reviewStatus: "not_requested",
    progress: 100,
    error: null,
    totalQuotaUnits: 2,
    packageUrl: "/api/video/delivery-packages/package-1/file",
    manifestUrl: "/api/video/delivery-packages/package-1/file?kind=manifest",
    items: [],
    platformProfile: {},
    reviewLinks: [],
    publishRecords: [],
    publishSummary: {},
    createdAt: 100,
    updatedAt: 130,
    ...overrides,
  }
}

test("OUTPUT-INVENTORY-1 无成片时不把创作快照冒充成片", () => {
  const inventory = buildOutputInventory({
    projectId: "project-1",
    renders: [],
    packages: [],
    snapshots: [
      { kind: "characters", version: 2, itemCount: 3 },
      { kind: "shots", version: 4, itemCount: 8 },
    ],
  })

  assert.equal(inventory.latestPlayable, null)
  assert.equal(inventory.playableRenders.length, 0)
  assert.equal(inventory.creationKinds, 2)
  assert.equal(inventory.nextAction.label, "去生成成片")
  assert.match(inventory.nextAction.href, /step=shots/)
})

test("OUTPUT-INVENTORY-2 运行中任务使用真实进度并给出去向", () => {
  const inventory = buildOutputInventory({
    projectId: "project-1",
    renders: [render({
      status: "running",
      progress: 37,
      videoUrl: null,
    })],
    packages: [],
    snapshots: [{ kind: "shots", version: 1, itemCount: 2 }],
  })

  assert.equal(inventory.latestPlayable, null)
  assert.equal(inventory.activeRender?.progress, 37)
  assert.equal(inventory.nextAction.label, "查看成片进度")
  assert.match(inventory.nextAction.detail, /37|正在渲染/)
})

test("OUTPUT-INVENTORY-3 成片、交付包和发布记录分层统计", () => {
  const inventory = buildOutputInventory({
    projectId: "project-1",
    renders: [
      render({ id: "preview", createdAt: 100 }),
      render({
        id: "delivery",
        qualityProfile: "delivery",
        createdAt: 200,
      }),
      render({
        id: "failed",
        status: "failed",
        videoUrl: null,
        createdAt: 300,
      }),
    ],
    packages: [
      pkg({
        id: "package-1",
        publishRecords: [{ id: "publish-1", platform: "douyin" }],
        updatedAt: 200,
      }),
    ],
    snapshots: [
      { kind: "characters", version: 1, itemCount: 2 },
      { kind: "shots", version: 2, itemCount: 5 },
    ],
  })

  assert.equal(inventory.latestPlayable?.id, "delivery")
  assert.equal(inventory.playableRenders.length, 2)
  assert.equal(inventory.deliveryRenders.length, 1)
  assert.equal(inventory.readyPackages.length, 1)
  assert.equal(inventory.publishedRecords.length, 1)
  assert.equal(inventory.nextAction.label, "查看交付物")
})
