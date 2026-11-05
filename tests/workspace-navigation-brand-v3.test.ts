import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

function read(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
}

const sidebar = read("components/WorkspaceSidebar.tsx")
const topbar = read("components/WorkspaceTopbar.tsx")
const page = read("app/page.tsx")
const fullscreen = read("components/FullscreenCanvas.tsx")
const canvasPage = read("app/canvas/page.tsx")
const brandMark = read("components/VeyaBrandMark.tsx")
const login = read("components/LoginPanel.tsx")
const guide = read("components/DocsGuide.tsx")
const shellCss = read("app/workspace-shell.css")

test("WNB1 教程入口进入左侧工作区菜单，顶栏不再单独堆放", () => {
  assert.match(sidebar, /className="wfx-nav-item wfx-docs-entry"[\s\S]*href="\/docs"[\s\S]*使用教程/)
  assert.match(topbar, /使用教程/)
  assert.doesNotMatch(topbar, /wfx-tutorial-entry/)
})

test("WNB2 新窗口画布使用独立全屏路由，不携带工作区 chrome", () => {
  assert.match(page, /window\.open\(/)
  assert.match(page, /\/canvas\?/)
  assert.doesNotMatch(page, /withWorkspaceModeQuery\(stepSearch, 'canvas'\)/)
  assert.match(canvasPage, /FullscreenCanvas/)
  assert.match(fullscreen, /className="signal-desk wfx-workspace fullscreen-canvas-page"/)
  assert.match(fullscreen, /CanvasGraphWorkspace/)
  assert.doesNotMatch(fullscreen, /WorkspaceSidebar|WorkspaceTopbar|InlineReleaseNotice|SiteLegalFooter/)
  assert.match(shellCss, /\.fullscreen-canvas-page\s*\{[^}]*height:\s*100dvh/s)
})

test("WNB3 登录页、侧栏与手机顶栏复用同一个六边形 V 品牌组件", () => {
  assert.match(brandMark, /viewBox="0 0 30 30"/)
  assert.match(brandMark, /M5 9 15 3l10 6v12l-10 6-10-6z/)
  assert.match(sidebar, /VeyaBrandMark/)
  assert.match(topbar, /VeyaBrandMark/)
  assert.match(login, /VeyaBrandMark/)
  assert.doesNotMatch(login, />V<\/span>/)
})

test("WNB4 教程同步当前工作区、全屏画布、App 与跨端说明", () => {
  for (const text of [
    "总览 / 创作 / 画布",
    "在新窗口打开",
    "全屏画布",
    "手机 App",
    "跨设备",
  ]) {
    assert.ok(guide.includes(text), `教程缺少 ${text}`)
  }
  assert.ok(fs.existsSync("public/docs/tutorial/07-fullscreen-canvas.png"))
})
