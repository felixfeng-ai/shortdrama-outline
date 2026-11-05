import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

function read(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
}

test("P1-V5 分镜页接入按集时间线，不新增独立工作流步骤", () => {
  const shotList = read("components/ShotList.tsx")
  assert.match(shotList, /EpisodeTimelinePanel/)
  assert.match(shotList, /episodes=/)
})

test("P1-V5 时间线明确缺视频阻断、幂等初始化和不可变版本", () => {
  const panel = read("components/EpisodeTimelinePanel.tsx")
  assert.match(panel, /缺视频/)
  assert.match(panel, /时长不一致/)
  assert.match(panel, /initializeTimeline/)
  assert.match(panel, /freezeTimelineVersion/)
  assert.match(panel, /已固化/)
  assert.match(panel, /草稿 v/)
  assert.match(panel, /裁剪/)
  assert.match(panel, /替换素材/)
  assert.match(panel, /videoCandidatesFor/)
  assert.match(panel, /本集配乐/)
  assert.match(panel, /使用授权/)
})

test("P1-V5 时间线客户端只通过服务端项目接口读写", () => {
  const client = read("lib/timeline/client.ts")
  assert.match(client, /\/api\/timelines\//)
  assert.match(client, /projectId/)
  assert.match(client, /expectedRevision/)
  assert.doesNotMatch(client, /localStorage|indexedDB/)
})
