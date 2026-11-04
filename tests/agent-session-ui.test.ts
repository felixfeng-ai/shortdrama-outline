import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("场记会话选择与新建会话使用统一控制条", () => {
  const dock = fs.readFileSync("components/AgentDock.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.match(dock, /className="agent-session-bar"/)
  assert.match(dock, /className="agent-session-select"/)
  assert.match(dock, /className="agent-session-new"/)
  assert.match(dock, /aria-label="切换 Veya Agent 会话"/)
  assert.match(dock, /onClick=\{\(\) => void newThread\(\)\}/)

  assert.match(css, /\.signal-desk \.agent-session-bar\s*\{/)
  assert.match(css, /\.signal-desk \.agent-session-select\s*\{/)
  assert.match(css, /\.signal-desk \.agent-session-new\s*\{/)
  assert.match(css, /\.agent-session-(?:select|new):disabled/)
  assert.match(css, /color-scheme:\s*dark/)
})

test("Agent 使用 Veya Agent 品牌名，并保留剧作与制作能力说明", () => {
  const dock = fs.readFileSync("components/AgentDock.tsx", "utf8")
  const drawer = fs.readFileSync("components/SkillAgentDrawer.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.match(dock, /Veya Agent/)
  assert.match(dock, /剧作与制作 Agent/)
  assert.match(drawer, /Veya Agent/)
  assert.match(page, /^\s*Agent\s*$/m)
  assert.match(css, /aria-label="Veya Agent"/)
  assert.doesNotMatch(dock, />AI 场记</)
})
