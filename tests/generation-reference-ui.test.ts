import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

function read(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
}

test("关键帧卡说明项目采用图会作为一致性参考，并展示本次实际数量", () => {
  const panel = read("components/KeyframePanel.tsx")
  const client = read("lib/generation/client.ts")

  assert.ok(panel.includes("项目已采用"))
  assert.ok(panel.includes("本次已带入"))
  assert.ok(panel.includes("本地参考图不会上传"))
  assert.equal(panel.includes("只发送当前提示词"), false)
  assert.ok(client.includes("referenceCount"))
})
