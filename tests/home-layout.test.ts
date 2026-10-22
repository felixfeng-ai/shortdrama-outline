import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const pageSrc = fs.readFileSync("app/page.tsx", "utf8")
const ideaSrc = fs.readFileSync("components/IdeaPanel.tsx", "utf8")
const projectSrc = fs.readFileSync("components/ProjectBar.tsx", "utf8")
const releaseSrc = fs.readFileSync("components/ReleaseNotice.tsx", "utf8")
const agentSrc = fs.readFileSync("components/AgentDock.tsx", "utf8")
const css = fs.readFileSync("app/globals.css", "utf8")

test("H1 上线公告收进顶栏，不再占用首页主内容首屏", () => {
  const headerStart = pageSrc.indexOf('<header className="h-top">')
  const headerEnd = pageSrc.indexOf("</header>", headerStart)
  const noticeIndex = pageSrc.indexOf("<ReleaseNotice")
  const mainStart = pageSrc.indexOf('<main className="h-work">')
  const mainEnd = pageSrc.indexOf('<aside className="h-deck', mainStart)

  assert.ok(headerStart >= 0 && headerEnd > headerStart, "找不到顶栏")
  assert.ok(noticeIndex > headerStart && noticeIndex < headerEnd, "公告入口不在顶栏")
  assert.ok(!pageSrc.slice(mainStart, mainEnd).includes("<ReleaseNotice"), "主内容里仍有公告横幅")
  assert.ok(releaseSrc.includes("release-trigger"), "公告没有紧凑入口")
  assert.ok(releaseSrc.includes("release-badge"), "新消息角标丢失")
})

test("H2 项目条压缩成单行账本，不重复堆元信息", () => {
  assert.ok(projectSrc.includes("project-ledger"), "项目条缺少紧凑布局类")
  assert.ok(projectSrc.includes("仅本机"), "本地存储边界仍要可见")
  assert.ok(!projectSrc.includes("border-t border-surface-line/80 pt-2"), "项目条仍有独立第二行")
})

test("H3 故事输入与环境工具改成双列，移除营销说明和空白撑高", () => {
  assert.ok(ideaSrc.includes("idea-workbench"), "故事输入没有工作台双列")
  assert.ok(!ideaSrc.includes("六步工作流：先定人物"), "首页仍堆着流程说明书")
  assert.ok(!ideaSrc.includes('className="fill min-h-[7rem]"'), "仍用空白块撑高输入区")
  assert.ok(css.includes(".idea-workbench"), "缺少双列布局样式")
})

test("H4 恢复/停止等轻提示不占正文，自动消退", () => {
  assert.ok(pageSrc.includes('className="work-toast"'), "轻提示仍占正文布局")
  assert.ok(pageSrc.includes("window.setTimeout(() => setNotice(null), 5000)"), "轻提示不会自动消退")
  assert.ok(css.includes(".work-toast"), "缺少轻提示浮层样式")
})

test("H5 首屏操作字号可读，常用关键词按需展开", () => {
  assert.ok(ideaSrc.includes("showKeywordHints"), "常用关键词仍默认铺开")
  assert.ok(ideaSrc.includes("常用关键词"), "缺少常用关键词入口")
  assert.ok(ideaSrc.includes("idea-tools-title"), "灵感工具没有分组标题")
  assert.ok(css.includes(".idea-tools-title"), "缺少灵感工具标题样式")
  assert.ok(css.includes(".workmeta button"), "缺少状态条按钮样式")
})

test("H6 右侧舱快捷指令使用连续命令列表，标签可读", () => {
  assert.ok(agentSrc.includes("agent-starter-list"), "快捷指令仍是散卡")
  assert.ok(agentSrc.includes("agent-starter"), "快捷指令缺少命令列表样式")
  assert.ok(css.includes("min-height: 30px"), "右侧舱标签点击高度仍不足")
})

test("H7 深色舱内快捷指令标题必须使用浅色文字", () => {
  assert.ok(css.includes(".agent-starter-q"), "缺少快捷指令标题样式")
  assert.ok(/\.agent-starter-q\s*\{[^}]*color:\s*#f0ebe2/s.test(css), "深色舱标题对比度不足")
})
