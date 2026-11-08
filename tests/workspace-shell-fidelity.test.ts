import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const sidebarPath = "components/WorkspaceSidebar.tsx"
const topbarPath = "components/WorkspaceTopbar.tsx"
const homePath = "components/WorkspaceHome.tsx"
const page = fs.readFileSync("app/page.tsx", "utf8")
const css = fs.readFileSync("app/workspace-shell.css", "utf8")

test("WFS1 桌面侧栏包含确认稿的三组菜单和固定顺序", () => {
  const sidebar = fs.readFileSync(sidebarPath, "utf8")
  const workspaceView = fs.readFileSync("lib/workspace-view.ts", "utf8")
  const workspaceLabels = ["首页", "我的项目", "项目待办", "创作技能", "资产库"]
  const tools = ["编排画布", "产物中心", "生产台账"]

  let previous = -1
  for (const label of workspaceLabels) {
    const current = sidebar.indexOf(label)
    assert.ok(current > previous, `工作区菜单顺序错误：${label}`)
    previous = current
  }
  assert.match(sidebar, /orderWorkspaceSteps/)
  assert.match(sidebar, /workspaceStepLabel/)
  assert.match(workspaceView, /"characters",\s*"acts",\s*"episodes",\s*"visuals",\s*"scenes",\s*"shots"/)
  previous = -1
  for (const label of tools) {
    const current = sidebar.indexOf(label)
    assert.ok(current > previous, `项目工具顺序错误：${label}`)
    previous = current
  }
  assert.match(sidebar, /我的创作空间/)
  assert.match(sidebar, /个人工作区/)
  assert.match(sidebar, /VeyaTV/)
})

test("WFS2 顶栏、公告和模式条使用确认稿顺序", () => {
  const topbar = fs.readFileSync(topbarPath, "utf8")
  assert.match(topbar, /我的项目/)
  assert.match(topbar, /导出交付包/)
  assert.match(topbar, /savedLabel/)
  assert.match(page, /savedLabel=\{workspaceSavedLabel\}/)
  assert.doesNotMatch(page, /'全部更改已保存'/)

  const topbarIndex = page.indexOf("<WorkspaceTopbar")
  const releaseIndex = page.indexOf("<InlineReleaseNotice")
  const modeIndex = page.indexOf("<WorkspaceModeTabs")
  assert.ok(topbarIndex >= 0 && releaseIndex > topbarIndex)
  assert.ok(modeIndex > releaseIndex)
})

test("WFS3 总览首屏使用确认稿主区和右栏，不再以故事输入为主角", () => {
  const home = fs.readFileSync(homePath, "utf8")
  for (const text of ["继续创作", "当前工作", "项目脉搏", "下一步", "可调用的创作方法", "最近产物"]) {
    assert.match(home, new RegExp(text))
  }
  assert.match(home, /项目脉搏/)
  assert.doesNotMatch(home, /IdeaPanel/)
  assert.match(home, /onContinue/)
  assert.doesNotMatch(home, /onOpenCanvas/)
})

test("WFS4 画布使用真实 CanvasGraphWorkspace 并内嵌显示", () => {
  assert.match(page, /CanvasGraphWorkspace/)
  assert.match(page, /workspaceMode === 'canvas'/)
  assert.match(page, /wfx-canvas-frame/)
  assert.match(css, /\.wfx-canvas-frame/)
})

test("WFS5 移动端提供完整侧栏抽屉与五项底部导航", () => {
  const sidebar = fs.readFileSync(sidebarPath, "utf8")
  assert.match(sidebar, /wfx-mobile-scrim/)
  assert.match(sidebar, /mobileOpen/)
  assert.match(page, /wfx-mobile-nav/)
  for (const label of ["首页", "项目", "待办", "技能", "我的"]) {
    assert.match(page, new RegExp(label))
  }
})

test("WFS6 新工作区使用确认稿 token，并以冷蓝替代鼠尾草绿", () => {
  assert.match(css, /--wfx-bg:\s*#08090a/i)
  assert.match(css, /--wfx-side:\s*#0a0b0c/i)
  assert.match(css, /--wfx-primary:\s*#f2f2ee/i)
  assert.match(css, /--wfx-accent:\s*#8dc8dc/i)
  assert.doesNotMatch(css, /--wfx-acid:\s*#c4d98a/i)
})

test("WFS7 当前步骤优先排序、项目脉搏和当前镜头选择使用真实状态", async () => {
  const helpers = await import("../lib/workspace-view.ts")
  assert.deepEqual(
    helpers.orderWorkspaceSteps(["characters", "acts", "episodes", "visuals", "scenes", "shots"], "shots"),
    ["shots", "characters", "acts", "episodes", "visuals", "scenes"],
  )
  assert.deepEqual(
    helpers.orderWorkspaceSteps(["characters", "acts", "episodes", "visuals", "scenes", "shots"], "characters"),
    ["characters", "acts", "episodes", "visuals", "scenes", "shots"],
  )
  assert.equal(helpers.workspaceStepLabel("visuals"), "角色定妆")
  assert.equal(helpers.workspaceStepLabel("scenes"), "场次剧本")

  const shots = [
    { id: "a", shot: 1, status: "done", missingRefFor: [] },
    { id: "b", shot: 3, status: "rework", missingRefFor: ["苏婉"] },
    { id: "c", shot: 2, status: "todo", missingRefFor: [] },
  ]
  assert.equal(helpers.selectCurrentShot(shots)?.id, "b")
  assert.deepEqual(
    helpers.buildProjectPulse({ episodes: 3, scenes: 4, shots: 8, todoItems: [
      { id: "missing-refs", text: "补图", step: "visuals", kind: "fix" },
      { id: "rework-shots", text: "返修", step: "shots", kind: "fix" },
    ] }),
    { episodes: 3, scenes: 4, shots: 8, blockers: 2 },
  )
})

test("WFS8 侧栏不重复展示保存状态，导航滚动区与账户区分离", () => {
  const sidebar = fs.readFileSync(sidebarPath, "utf8")
  assert.doesNotMatch(sidebar, /savedLabel|wfx-side-save/)
  assert.match(css, /\.wfx-side-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s)
  assert.match(css, /\.wfx-side-user\s*\{[^}]*flex:\s*0 0 auto;[^}]*border-top:/s)
})

test("WFS9 development indicator does not cover the sidebar account area", () => {
  const nextConfig = fs.readFileSync("next.config.mjs", "utf8")
  assert.match(nextConfig, /devIndicators:\s*false/)
})
