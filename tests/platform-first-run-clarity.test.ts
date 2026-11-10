import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const page = fs.readFileSync("app/page.tsx", "utf8")
const sidebar = fs.readFileSync("components/WorkspaceSidebar.tsx", "utf8")
const modeTabs = fs.readFileSync("components/WorkspaceModeTabs.tsx", "utf8")
const css = fs.readFileSync("app/workspace-shell.css", "utf8")

test("PFR1 空项目总览不挂项目步骤、项目工具、移动导航和 Agent 舱", () => {
  assert.match(sidebar, /projectId\s*\?\s*\(/)
  assert.match(page, /Boolean\(projectId\)\s*\|\|\s*workspaceMode\s*!==\s*['"]overview['"]/)
  assert.match(page, /hasProject=\{Boolean\(projectId\)\}/)
})

test("PFR2 模式切换使用可预 hydration 跳转的原生链接", () => {
  assert.match(modeTabs, /hrefForMode/)
  assert.match(modeTabs, /<a/)
  assert.match(modeTabs, /href=\{hrefForMode\(item\.id\)\}/)
  assert.match(modeTabs, /event\.preventDefault\(\)/)
  assert.match(modeTabs, /onChange\(item\.id\)/)
})

test("PFR3 移动固定层为底部导航和 Agent 抓手预留安全空间", () => {
  assert.match(css, /\.wfx-workspace-main\s*\{[^}]*padding-bottom:\s*calc\(128px\s*\+\s*env\(safe-area-inset-bottom\)\)/s)
  assert.match(css, /\.signal-desk \.h-deck\s*\{[^}]*bottom:\s*calc\(64px\s*\+\s*env\(safe-area-inset-bottom\)\)/s)
})
