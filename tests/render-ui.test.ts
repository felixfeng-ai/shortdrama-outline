import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("P1-V5.12 时间线提供对白试听、从头重放和溢出阻断提示", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")
  assert.match(timeline, /<audio/)
  assert.match(timeline, /从头重放/)
  assert.match(timeline, /对白超出镜头时长/)
})

test("P1-V5.15 时间线接入渲染队列和 MP4/SRT/manifest 下载", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")
  const client = fs.readFileSync("lib/video/render-client.ts", "utf8")
  assert.match(timeline, /加入渲染队列/)
  assert.match(timeline, /下载 MP4/)
  assert.match(timeline, /下载 SRT/)
  assert.match(timeline, /下载 manifest/)
  assert.match(client, /\/api\/video\/renders/)
})
