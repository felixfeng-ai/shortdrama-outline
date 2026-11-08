import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { withVideoContinuityLock } from "../lib/video/tasks.ts"

test("CONTINUITY-LOCK1 视频提示词锁定角色身份并禁止换脸", () => {
  const prompt = withVideoContinuityLock("快递员站在雨夜门外", {
    characters: ["陈默", "苏婉"],
  })
  assert.match(prompt, /CONTINUITY LOCK/)
  assert.match(prompt, /陈默、苏婉/)
  assert.match(prompt, /不换脸/)
  assert.match(prompt, /人物身份必须连续/)
})

test("CONTINUITY-LOCK2 首帧缺少角色身份参考时阻止视频提交", () => {
  const panel = fs.readFileSync("components/BatchVideoPanel.tsx", "utf8")
  const tasks = fs.readFileSync("lib/video/tasks.ts", "utf8")

  assert.match(panel, /frameHasCharacterIdentityGuide/)
  assert.match(panel, /首帧缺少角色身份参考/)
  assert.match(panel, /角色身份锁定/)
  assert.match(tasks, /withVideoContinuityLock/)
  assert.match(tasks, /continuityLock/)
})
