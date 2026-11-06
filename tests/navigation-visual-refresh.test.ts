import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const page = fs.readFileSync("app/page.tsx", "utf8")
const css = fs.readFileSync("app/workspace-shell.css", "utf8")
const sidebar = fs.readFileSync("components/WorkspaceSidebar.tsx", "utf8")

test("N1 大屏快捷键移入侧栏，顶栏不再堆叠工作区按钮", () => {
  assert.match(page, /<WorkspaceSidebar/)
  assert.match(page, /<WorkspaceTopbar/)
  assert.match(sidebar, /aria-label="工作区导航"/)
  assert.match(sidebar, /我的创作空间/)
  assert.match(css, /\.wfx-side \{/)
})

test("N2 顶栏按钮默认去掉硬描边，保留明确交互状态", () => {
  assert.match(css, /border-color: transparent/)
  assert.match(css, /\.wfx-button\.is-secondary/)
  assert.match(css, /\.wfx-button\.is-ghost/)
})

test("N3-N4 桌面侧栏显示完整导航和分组", () => {
  assert.match(sidebar, /首页/)
  assert.match(sidebar, /我的项目/)
  assert.match(sidebar, /项目待办/)
  assert.match(sidebar, /创作技能/)
  assert.match(sidebar, /资产库/)
  assert.match(sidebar, /编排画布/)
  assert.match(sidebar, /产物中心/)
  assert.match(sidebar, /生产台账/)
  assert.match(css, /width: 232px/)
  assert.match(css, /position: fixed/)
})

test("N5-N6 当前步骤使用浅填充，完成态只保留小圆点", () => {
  assert.match(css, /\.wfx-nav-item\.is-current/)
  assert.match(css, /background: var\(--wfx-surface-3\)/)
  assert.match(css, /\.wfx-step-state/)
  assert.match(css, /background: var\(--wfx-accent\)/)
})

test("N6-N8 中屏图标轨、手机抽屉和底部导航", () => {
  assert.match(css, /@media \(min-width: 961px\) and \(max-width: 1080px\)/)
  assert.match(css, /@media \(max-width: 960px\)/)
  assert.match(css, /\.wfx-mobile-nav/)
  assert.match(css, /min-height: 44px/)
  assert.match(css, /prefers-reduced-motion/)
})

test("N9 我的项目支持逐条删除，并在原位置二次确认", () => {
  assert.match(sidebar, /onDeleteProject/)
  assert.match(sidebar, /确认删除/)
  assert.match(sidebar, /取消/)
  assert.match(sidebar, /aria-label=\{`删除项目/)
  assert.match(sidebar, /isConfirming \?/)
  assert.match(page, /onDeleteProject=\{handleDeleteProject\}/)
})

test("N10 工作区提示不被侧栏覆盖，删除后明确显示剩余项目数", () => {
  assert.match(css, /\.wfx-workspace \.work-toast\s*\{[^}]*z-index:\s*140/s)
  assert.match(css, /\.wfx-workspace \.work-toast\s*\{[^}]*left:\s*256px/s)
  assert.match(page, /还剩 \$\{remaining\.length\} 个项目/)
})
