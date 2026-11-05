import { test } from "node:test"
import assert from "node:assert/strict"

import { buildRenderNotification } from "../lib/push/notification.ts"

test("P2 成片完成通知回到对应集与时间线", () => {
  const success = buildRenderNotification({
    renderId: "render-1",
    projectId: "project-1",
    episode: 3,
    status: "succeeded",
    durationMs: 65_000,
  })
  assert.match(success.title, /第 3 集成片/)
  assert.match(success.body, /65 秒/)
  assert.match(success.url, /project=project-1/)
  assert.match(success.url, /step=shots/)
  assert.match(success.url, /episode=3/)

  const failed = buildRenderNotification({
    renderId: "render-2",
    projectId: "project-1",
    episode: 3,
    status: "failed",
    error: "D:\\secret\\render.mp4 文件损坏",
  })
  assert.match(failed.title, /失败/)
  assert.ok(!failed.body.includes("D:\\secret"))
})
