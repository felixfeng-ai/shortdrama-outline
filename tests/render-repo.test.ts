import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  claimNextVideoRender,
  completeVideoRender,
  createVideoRender,
  failVideoRender,
  getVideoRender,
  listVideoRenders,
  recoverInterruptedVideoRenders,
} from "../lib/video/render-repo.ts"

test("P1-V5.17 渲染任务持久化、同版本去重并按创建顺序单路领取", () => {
  const db = openDb(":memory:")
  const project = createProject(db, "渲染队列", "owner-render")
  const first = createVideoRender(db, {
    projectId: project.id,
    episode: 1,
    timelineVersionId: "version-1",
    timelineRevision: 3,
  })
  const duplicate = createVideoRender(db, {
    projectId: project.id,
    episode: 1,
    timelineVersionId: "version-1",
    timelineRevision: 3,
  })
  const second = createVideoRender(db, {
    projectId: project.id,
    episode: 2,
    timelineVersionId: "version-2",
    timelineRevision: 4,
  })

  assert.equal(first.id, duplicate.id)
  assert.equal(first.status, "queued")
  const claimed = claimNextVideoRender(db)
  assert.equal(claimed?.id, first.id)
  assert.equal(claimed?.status, "running")
  assert.equal(claimNextVideoRender(db), null)

  completeVideoRender(db, first.id, {
    durationMs: 5_000,
    videoStorageKey: `generated/${project.id}/renders/${first.id}/output.mp4`,
    srtStorageKey: `generated/${project.id}/renders/${first.id}/output.srt`,
    manifestStorageKey: `generated/${project.id}/renders/${first.id}/manifest.json`,
  })
  assert.equal(getVideoRender(db, project.id, first.id)?.status, "succeeded")

  const next = claimNextVideoRender(db)
  assert.equal(next?.id, second.id)
  failVideoRender(db, second.id, "FFmpeg 编码失败")
  assert.match(getVideoRender(db, project.id, second.id)?.error ?? "", /FFmpeg/)
  assert.equal(listVideoRenders(db, project.id, 1).length, 1)

  const interrupted = createVideoRender(db, {
    projectId: project.id,
    episode: 3,
    timelineVersionId: "version-3",
    timelineRevision: 5,
  })
  assert.equal(claimNextVideoRender(db)?.id, interrupted.id)
  assert.equal(recoverInterruptedVideoRenders(db), 1)
  assert.match(
    getVideoRender(db, project.id, interrupted.id)?.error ?? "",
    /服务重启/,
  )
})
