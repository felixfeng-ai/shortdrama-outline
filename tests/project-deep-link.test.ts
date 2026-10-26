import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("P1/P4 项目深链与分享入口已接入工作台", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const projectBar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  assert.ok(page.includes("readProjectQuery"))
  assert.ok(page.includes("withProjectQuery"))
  assert.ok(page.includes("handleCopyProjectLink"))
  assert.ok(projectBar.includes("onCopyLink"))
  assert.ok(projectBar.includes("复制项目链接"))
})

test("P2/P3 项目切换与失效链接都有明确处理", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(page.includes("handleSwitchProject"))
  assert.ok(page.includes("writeProjectToUrl"))
  assert.ok(page.includes("项目链接已失效"))
})
