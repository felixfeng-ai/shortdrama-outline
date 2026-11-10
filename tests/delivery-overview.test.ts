import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { createDeliveryPackage } from "../lib/delivery/repo.ts"
import { getDeliveryOverview } from "../lib/delivery/overview.ts"
import {
  completeVideoRender,
  createVideoRender,
} from "../lib/video/render-repo.ts"

function seedDelivery(
  db: ReturnType<typeof openDb>,
  projectId: string,
  episode: number,
) {
  const render = createVideoRender(db, {
    projectId,
    episode,
    timelineVersionId: `timeline-${projectId}-${episode}`,
    timelineRevision: episode,
    qualityProfile: "delivery",
    exportPreset: "vertical",
  })
  completeVideoRender(db, render.id, {
    durationMs: 7_000,
    videoStorageKey: `generated/${projectId}/render-${episode}.mp4`,
    srtStorageKey: `generated/${projectId}/render-${episode}.srt`,
    manifestStorageKey: `generated/${projectId}/render-${episode}.json`,
  })
  return createDeliveryPackage(db, {
    projectId,
    title: `第 ${episode} 集交付`,
    scope: "episode",
    platform: "douyin",
    subtitleMode: "both",
    items: [{ episode, renderId: render.id }],
  })
}

test("DELIVERY-OVERVIEW1 aggregates every delivery project for the current owner", () => {
  const db = openDb(":memory:")
  try {
    const first = createProject(db, "第一项目", "owner-delivery-overview")
    const second = createProject(db, "第二项目", "owner-delivery-overview")
    const empty = createProject(db, "空项目", "owner-delivery-overview")
    const foreign = createProject(db, "其他用户项目", "owner-other")

    const ready = seedDelivery(db, first.id, 1)
    db.prepare("UPDATE video_delivery_packages SET status = 'ready', progress = 100 WHERE id = ?")
      .run(ready.id)
    seedDelivery(db, second.id, 1)
    seedDelivery(db, foreign.id, 1)

    const overview = getDeliveryOverview(db, "owner-delivery-overview")

    assert.deepEqual(
      overview.projects.map((item) => item.project.id).sort(),
      [first.id, second.id, empty.id].sort(),
    )
    assert.equal(overview.totals.projects, 3)
    assert.equal(overview.totals.totalPackages, 2)
    assert.equal(overview.totals.readyPackages, 1)
    assert.equal(overview.totals.queuedPackages, 1)
    assert.ok(!overview.projects.some((item) => item.project.id === foreign.id))
  } finally {
    db.close()
  }
})
