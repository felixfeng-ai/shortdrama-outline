import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  getRenderApproval,
  updateRenderApproval,
} from "../lib/video/render-approvals.ts"
import { createVideoRender } from "../lib/video/render-repo.ts"

test("APPROVAL1 成片交付审核可提交、通过和退回修改", () => {
  const db = openDb(":memory:")
  const project = createProject(db, "审核测试", "reviewer-owner")
  const render = createVideoRender(db, {
    projectId: project.id,
    episode: 1,
    timelineVersionId: "version-1",
    timelineRevision: 1,
    qualityProfile: "delivery",
    exportPreset: "vertical",
  })
  db.prepare("UPDATE video_renders SET status = 'succeeded' WHERE id = ?").run(render.id)

  const pending = updateRenderApproval(db, {
    projectId: project.id,
    renderId: render.id,
    action: "request",
    reviewerLabel: "制片人",
  })
  assert.equal(pending.status, "pending")

  const approved = updateRenderApproval(db, {
    projectId: project.id,
    renderId: render.id,
    action: "approve",
    note: "可以交付",
    reviewerLabel: "制片人",
  })
  assert.equal(approved.status, "approved")
  assert.equal(getRenderApproval(db, project.id, render.id)?.note, "可以交付")

  const changes = updateRenderApproval(db, {
    projectId: project.id,
    renderId: render.id,
    action: "request_changes",
    note: "修改片头",
    reviewerLabel: "制片人",
  })
  assert.equal(changes.status, "changes_requested")
})

test("APPROVAL2 审核 API、客户端和页面操作已接线", () => {
  const route = fs.readFileSync("app/api/video/renders/[id]/approval/route.ts", "utf8")
  const client = fs.readFileSync("lib/video/render-client.ts", "utf8")
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")

  assert.match(route, /updateRenderApproval/)
  assert.match(client, /updateRenderApproval/)
  assert.match(timeline, /changeRenderApproval/)
  assert.match(timeline, /提交审核/)
  assert.match(timeline, /退回修改/)
})
