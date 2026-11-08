import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  createVideoRender,
  completeVideoRender,
} from "../lib/video/render-repo.ts"
import {
  createDeliveryPackage,
  getDeliveryPackage,
  listDeliveryItems,
  listDeliveryPackages,
} from "../lib/delivery/repo.ts"

function seedRender(
  db: ReturnType<typeof openDb>,
  projectId: string,
  episode: number,
  quality: "preview" | "delivery" = "delivery",
) {
  const render = createVideoRender(db, {
    projectId,
    episode,
    timelineVersionId: `timeline-${episode}`,
    timelineRevision: episode,
    qualityProfile: quality,
    exportPreset: "vertical",
  })
  return completeVideoRender(db, render.id, {
    durationMs: 7_000,
    videoStorageKey: `generated/${projectId}/render-${episode}.mp4`,
    srtStorageKey: `generated/${projectId}/render-${episode}.srt`,
    manifestStorageKey: `generated/${projectId}/render-${episode}.json`,
  })
}

test("DELIVERY-REPO1 创建单集交付包并保留渲染版本", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "交付包项目", "owner-delivery")
    const render = seedRender(db, project.id, 1)
    const pkg = createDeliveryPackage(db, {
      projectId: project.id,
      title: "第一集交付",
      scope: "episode",
      platform: "douyin",
      subtitleMode: "both",
      items: [{ episode: 1, renderId: render.id }],
    })
    assert.equal(pkg.status, "queued")
    assert.equal(pkg.platform, "douyin")
    const items = listDeliveryItems(db, pkg.id)
    assert.equal(items.length, 1)
    assert.equal(items[0].renderId, render.id)
    assert.equal(getDeliveryPackage(db, project.id, pkg.id)?.id, pkg.id)
    assert.equal(listDeliveryPackages(db, project.id).length, 1)
  } finally {
    db.close()
  }
})

test("DELIVERY-REPO2 发布包拒绝预览渲染和跨项目渲染", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "交付包项目", "owner-delivery")
    const other = createProject(db, "其他项目", "owner-delivery")
    const preview = seedRender(db, project.id, 1, "preview")
    assert.throws(() => createDeliveryPackage(db, {
      projectId: project.id,
      title: "错误交付",
      scope: "episode",
      platform: "douyin",
      subtitleMode: "both",
      items: [{ episode: 1, renderId: preview.id }],
    }), /交付版/)

    const foreign = seedRender(db, other.id, 1, "delivery")
    assert.throws(() => createDeliveryPackage(db, {
      projectId: project.id,
      title: "错误交付",
      scope: "episode",
      platform: "douyin",
      subtitleMode: "both",
      items: [{ episode: 1, renderId: foreign.id }],
    }), /不存在/)
  } finally {
    db.close()
  }
})

test("DELIVERY-REPO3 整季包按集号排序并拒绝重复集", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "整季项目", "owner-delivery")
    const render2 = seedRender(db, project.id, 2)
    const render1 = seedRender(db, project.id, 1)
    const pkg = createDeliveryPackage(db, {
      projectId: project.id,
      title: "整季交付",
      scope: "series",
      platform: "youtube",
      subtitleMode: "both",
      items: [
        { episode: 2, renderId: render2.id },
        { episode: 1, renderId: render1.id },
      ],
    })
    assert.deepEqual(listDeliveryItems(db, pkg.id).map((item) => item.episode), [1, 2])
    assert.throws(() => createDeliveryPackage(db, {
      projectId: project.id,
      title: "重复集",
      scope: "series",
      platform: "youtube",
      subtitleMode: "both",
      items: [
        { episode: 1, renderId: render1.id },
        { episode: 1, renderId: render2.id },
      ],
    }), /重复/)
  } finally {
    db.close()
  }
})

