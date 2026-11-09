import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const page = fs.readFileSync("app/page.tsx", "utf8")
const workspaceHome = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")
const ideaPanel = fs.readFileSync("components/IdeaPanel.tsx", "utf8")
const workspaceCss = fs.readFileSync("app/workspace-shell.css", "utf8")
const skills = fs.readFileSync("app/skills/skills.css", "utf8")
const nextConfig = fs.readFileSync("next.config.mjs", "utf8")

test("WM-UI1 正式工作区保留总览、创作、画布三模式切换", () => {
  assert.match(page, /<WorkspaceModeTabs mode=\{workspaceMode\} onChange=\{openWorkspaceMode\}/)
  assert.match(page, /<CanvasGraphWorkspace/)
  assert.match(page, /className="wfx-mode-strip"/)
  assert.match(workspaceCss, /\.wfx-mode-strip/)
})

test("WM-UI2 创作复用技能库，公告保留在确认稿位置", () => {
  assert.match(page, /<InlineReleaseNotice \/>/)
  assert.match(page, /<SkillCatalog embedded \/>/)
  assert.match(skills, /\.skill-page\.skill-page-embedded/)
})

test("WM-UI3 嵌入创作使用紧凑标题、白色主操作和冷蓝运行态", () => {
  assert.match(skills, /--acid:\s*var\(--signal-blue\)/)
  assert.match(skills, /font-size:\s*clamp\(24px,\s*2vw,\s*30px\)/)
  assert.match(skills, /\.skill-page-embedded \.send-button/)
  assert.match(skills, /background:\s*var\(--text\)/)
})

test("WM-UI4 正式构建保持严格嵌入与安全头", () => {
  assert.match(nextConfig, /X-Frame-Options/)
  assert.match(nextConfig, /frame-ancestors 'none'/)
  assert.doesNotMatch(nextConfig, /localhost:3220/)
})

test("WM-UI5 每个工作模式都有页面级标题，输入区使用中文标签", () => {
  assert.match(workspaceHome, /<h1>继续创作<\/h1>/)
  assert.match(page, /<h1 id="wfx-canvas-title">画布<\/h1>/)
  assert.match(ideaPanel, /故事指令/)
  assert.doesNotMatch(ideaPanel, />STORY COMMAND</)
})
