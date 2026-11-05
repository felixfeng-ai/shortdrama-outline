import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("PT1 项目条提供一个明确的低频工具入口", () => {
  const projectBar = fs.readFileSync("components/ProjectBar.tsx", "utf8")

  assert.ok(projectBar.includes("onOpenTools"), "项目条没有打开工具面板的回调")
  assert.ok(projectBar.includes("toolsAvailable"), "项目条没有工具可用状态")
  assert.ok(projectBar.includes("项目工具"), "缺少用户能理解的入口文案")
  assert.ok(projectBar.includes('aria-label="打开项目工具"'), "工具入口缺少可访问名称")
  assert.ok(projectBar.includes("disabled={!toolsAvailable}"), "无项目时工具入口仍可打开")
})

test("PT2 页面正文不再常驻三个低频工具", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")

  assert.ok(page.includes("<ProjectToolsPanel"), "页面没有挂载统一工具面板")
  assert.ok(!page.includes("<EntityCommentsPanel"), "实体批注仍常驻页面正文")
  assert.ok(!page.includes("<AssetLibraryPanel"), "资产库仍常驻页面正文")
  assert.ok(!page.includes("<ProjectBranchPanel"), "版本分支仍常驻页面正文")
  assert.ok(page.includes("projectToolsOpen"), "页面没有工具面板开关状态")
})

test("PT3 工具面板只有打开时才挂载内容，并解释三个工具用途", () => {
  const panel = fs.existsSync("components/ProjectToolsPanel.tsx")
    ? fs.readFileSync("components/ProjectToolsPanel.tsx", "utf8")
    : ""

  assert.ok(panel.includes("if (!open) return null"), "关闭时仍会挂载三个重组件")
  assert.ok(panel.includes("实体批注"), "缺少实体批注页签")
  assert.ok(panel.includes("跨项目资产"), "缺少跨项目资产页签")
  assert.ok(panel.includes("版本分支"), "缺少版本分支页签")
  assert.ok(panel.includes("只生成待确认修改"), "实体批注没有解释确认边界")
  assert.ok(panel.includes("不带走本地图片"), "资产库没有解释隐私边界")
  assert.ok(panel.includes("不覆盖当前正文"), "版本分支没有解释安全边界")
  assert.ok(panel.includes('role="dialog"'), "工具面板缺少 dialog 语义")
  assert.ok(panel.includes('aria-modal="true"'), "工具面板缺少模态语义")
  assert.ok(panel.includes("event.key === 'Escape'"), "工具面板不支持 Escape")
  assert.ok(panel.includes("previousFocus"), "关闭后没有恢复焦点")
  assert.ok(panel.includes("activeTool === 'comments'"), "没有只挂载当前页签")
  assert.ok(panel.includes("<EntityCommentsPanel"), "没有接入批注能力")
  assert.ok(panel.includes("<AssetLibraryPanel"), "没有接入资产库能力")
  assert.ok(panel.includes("<ProjectBranchPanel"), "没有接入版本分支能力")
})

test("PT4 工具面板有明确的桌面与手机布局", () => {
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.ok(css.includes(".project-tools-overlay"), "缺少工具面板遮罩")
  assert.ok(css.includes(".project-tools-dialog"), "缺少工具面板主体")
  assert.ok(css.includes(".project-tools-tabs"), "缺少工具页签")
  assert.ok(css.includes(".project-tools-tab"), "缺少单个工具页签样式")
  assert.ok(css.includes(".project-tools-tab small"), "页签缺少用途说明")
  assert.ok(css.includes("min-height: 44px"), "主要按钮触控目标不足 44px")
  assert.ok(css.includes("@media (max-width: 640px)"), "缺少窄屏布局")
})
