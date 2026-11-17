import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { parseWorkspaceStartIntent } from "../lib/workspace-entry.ts"

test("轻量起始页只接受明确的创作意图", () => {
  assert.deepEqual(
    parseWorkspaceStartIntent(JSON.stringify({
      kind: "quick",
      idea: "被家族抛弃的继承人发现遗嘱是伪造的",
      target: "keyframe",
    })),
    {
      kind: "quick",
      idea: "被家族抛弃的继承人发现遗嘱是伪造的",
      target: "keyframe",
    },
  )
  assert.equal(parseWorkspaceStartIntent("{"), null)
  assert.equal(parseWorkspaceStartIntent(JSON.stringify({
    kind: "quick",
    idea: "太短",
    target: "keyframe",
  })), null)
  assert.equal(parseWorkspaceStartIntent(JSON.stringify({
    kind: "quick",
    idea: "这是一个足够长的故事想法",
    target: "unknown",
  })), null)
})

test("根路径无参数时进入轻量起始页，选择项目后才加载完整工作区", () => {
  const proxy = fs.readFileSync("proxy.ts", "utf8")
  const workspace = fs.readFileSync("app/page.tsx", "utf8")
  const startPage = fs.readFileSync("app/start/page.tsx", "utf8")
  const startClient = fs.readFileSync("components/WorkspaceStart.tsx", "utf8")

  assert.match(proxy, /NextResponse\.rewrite/)
  assert.match(proxy, /pathname === "\/"/)
  assert.match(workspace, /parseWorkspaceStartIntent/)
  assert.match(workspace, /WORKSPACE_START_STORAGE_KEY/)
  assert.match(startPage, /WorkspaceStart/)
  assert.match(startClient, /<WorkspaceOnboarding/)
  assert.match(startClient, /new URL\("\/", window\.location\.origin\)/)
})
