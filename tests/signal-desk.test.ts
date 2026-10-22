import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const layoutSrc = fs.readFileSync("app/layout.tsx", "utf8")
const pageSrc = fs.readFileSync("app/page.tsx", "utf8")
const css = fs.readFileSync("app/globals.css", "utf8")
const projectSrc = fs.readFileSync("components/ProjectBar.tsx", "utf8")
const ideaSrc = fs.readFileSync("components/IdeaPanel.tsx", "utf8")
const agentSrc = fs.readFileSync("components/AgentDock.tsx", "utf8")
const sideNavSrc = fs.readFileSync("components/SideNav.tsx", "utf8")
const stepPillsSrc = fs.readFileSync("components/StepPills.tsx", "utf8")
const overviewSrc = fs.existsSync("components/SignalOverview.tsx")
  ? fs.readFileSync("components/SignalOverview.tsx", "utf8")
  : ""
const collapseSrc = fs.existsSync("components/SmoothCollapse.tsx")
  ? fs.readFileSync("components/SmoothCollapse.tsx", "utf8")
  : ""
const briefSrc = fs.readFileSync("components/BriefCard.tsx", "utf8")
const todoSrc = fs.readFileSync("components/TodoPanel.tsx", "utf8")
const judgmentSrc = fs.readFileSync("components/JudgmentLogPanel.tsx", "utf8")
const lookSrc = fs.readFileSync("components/LookBookCard.tsx", "utf8")
const releaseSrc = fs.readFileSync("components/ReleaseNotice.tsx", "utf8")
const actSrc = fs.readFileSync("components/ActList.tsx", "utf8")
const shotSrc = fs.readFileSync("components/ShotCard.tsx", "utf8")
const versionSrc = fs.readFileSync("components/VersionBar.tsx", "utf8")
const streamingSrc = fs.existsSync("components/StreamingText.tsx")
  ? fs.readFileSync("components/StreamingText.tsx", "utf8")
  : ""
const projectCanvasSrc = fs.readFileSync("components/ProjectCanvas.tsx", "utf8")
const richTextSrc = fs.existsSync("components/AgentRichText.tsx")
  ? fs.readFileSync("components/AgentRichText.tsx", "utf8")
  : ""

test("SDA1 Signal Desk 主题挂在根节点，不改业务组件 API", () => {
  assert.ok(layoutSrc.includes('className="signal-desk"'), "根节点缺少 signal-desk 类")
  assert.ok(css.includes(".signal-desk"), "缺少 Signal Desk 主题作用域")
  assert.ok(css.includes("--c-surface: 19 23 26"), "画布底色仍不是舒适版石墨")
  assert.ok(css.includes("--signal-acid: #c4d98a"), "主操作色仍不是低饱和鼠尾草绿")
})

test("SDA2 桌面六步导航进入左侧轨道，窄屏仍可回到顶栏", () => {
  assert.ok(pageSrc.includes("signal-rail"), "页面没有左侧步骤轨道")
  assert.ok(pageSrc.includes("<SideNav"), "左侧轨道没有复用六步导航组件")
  assert.ok(css.includes(".signal-rail"), "缺少左侧轨道样式")
  assert.ok(css.includes(".signal-desk .h-pills"), "缺少桌面顶栏步骤隐藏规则")
})

test("SDA3 动效强度 8 只作用于运行态和过渡，并有 reduced-motion 兜底", () => {
  assert.ok(css.includes(".signal-desk .h-run.busy"), "运行态没有专属动效")
  assert.ok(css.includes(".signal-desk section"), "缺少步骤切换动效作用域")
  assert.ok(css.includes("prefers-reduced-motion"), "缺少 reduced-motion 兜底")
})

test("SDA4 整体换肤不能删掉核心入口", () => {
  assert.ok(pageSrc.includes("<ProjectBar"), "项目条丢失")
  assert.ok(pageSrc.includes("<IdeaPanel"), "故事输入丢失")
  assert.ok(pageSrc.includes("<AgentDock"), "AI 场记丢失")
  assert.ok(projectSrc.includes("导出备份"), "项目备份入口丢失")
  assert.ok(ideaSrc.includes("生成 · 核心人物"), "核心生成入口丢失")
  assert.ok(agentSrc.includes("AI 场记"), "场记身份丢失")
})

test("SDA5 深色主题里的警告提示和半透明代码块必须压暗", () => {
  assert.ok(css.includes("--c-accent-700: 213 141 115"), "警告文字不是舒适版低饱和橙")
  assert.ok(css.includes('[class*="bg-ink-50/"]'), "半透明 ink 背景没有深色覆盖")
})

test("SDA6 窄屏顶栏步骤和 AI 抽屉必须沿用 Signal Desk 状态色", () => {
  assert.ok(css.includes(".signal-desk .h-pill {"), "移动顶栏步骤缺少 Signal Desk 基础样式")
  assert.ok(css.includes(".signal-desk .h-pill.on {"), "移动顶栏选中步骤缺少深色状态")
  assert.ok(css.includes(".signal-desk .h-pill.done em"), "移动顶栏完成步骤缺少冷蓝状态")
  assert.ok(css.includes(".signal-desk .h-deck-grab {"), "移动 AI 抽屉抓手缺少主题覆盖")
  assert.ok(css.includes(".signal-desk .h-deck-grab-row .go {"), "移动 AI 抽屉快捷按钮缺少主题覆盖")
})

test("SDA7 舒适版必须拉开底色、正文和辅助色层级", () => {
  assert.ok(css.includes("--signal-text: #dfe4e2"), "正文仍偏纯白，长时间阅读会眩光")
  assert.ok(css.includes("--signal-text-3: #8b969d"), "辅助文字对比度没有校准")
  assert.ok(css.includes("--signal-line: rgba(213, 224, 228, .11)"), "边界仍是高对比硬线")
  assert.ok(css.includes("--signal-blue: #8eb7e7"), "运行态仍是电光蓝")
})

test("SDA8 桌面左轨和 AI 舱必须采用舒适版信息节奏", () => {
  assert.ok(css.includes("width: 60px;"), "左轨没有为图标和短文案留出空间")
  assert.ok(
    css.includes(".signal-desk .signal-rail .navpanel button > span:last-child { display: block; }"),
    "左轨仍只显示图标，用户无法辨认步骤",
  )
  assert.ok(pageSrc.includes("signal-rail-logo"), "左轨顶部缺少 Lime 品牌块")
  assert.ok(
    css.includes("width: clamp(360px, 30vw, 400px);"),
    "AI 舱仍过宽，挤压主工作区",
  )
})

test("SDA9 舒适版窄屏保留灵感助手，并让六步使用短标签", () => {
  assert.ok(sideNavSrc.includes("{step.short}"), "桌面左轨没有使用便于扫读的短标签")
  assert.ok(stepPillsSrc.includes("pill-short"), "手机顶栏没有独立的短标签")
  assert.ok(
    !css.includes(".signal-desk .idea-tools {\n    display: none;"),
    "窄屏把灵感助手整个隐藏了，影响原有联想功能",
  )
})

test("SDA10 窄屏 AI 抽屉必须占满视口，不继承桌面固定宽度", () => {
  assert.ok(
    css.includes(".signal-desk .h-deck { width: auto; }"),
    "窄屏 AI 抽屉仍继承桌面固定宽度",
  )
})

test("SDA11 首页主区必须包含 STORY COMMAND、六步轨道与两张项目状态卡", () => {
  assert.ok(ideaSrc.includes("STORY COMMAND"), "故事主卡缺少 STORY COMMAND 标识")
  assert.ok(ideaSrc.includes("story-tools-toggle"), "灵感助手没有可展开入口")
  assert.ok(pageSrc.includes("<SignalOverview"), "首页没有挂载六步与项目状态总览")
  assert.ok(overviewSrc.includes("signal-flow"), "缺少图片 demo 的六步轨道")
  assert.ok(overviewSrc.includes("项目脉搏"), "缺少项目脉搏卡")
  assert.ok(overviewSrc.includes("最近动作"), "缺少最近动作卡")
})

test("SDA12 场记空态必须呈现提问气泡和可读的项目判断", () => {
  assert.ok(agentSrc.includes("agent-welcome"), "场记空态缺少对话开场结构")
  assert.ok(agentSrc.includes("agent-prompt-bubble"), "场记空态缺少用户提问气泡")
  assert.ok(agentSrc.includes("agent-answer-bubble"), "场记空态缺少场记判断气泡")
})

test("SDA13 右侧产出/场记页签必须正常占位，禁止覆盖内容", () => {
  assert.ok(
    css.includes(".signal-desk .h-deck-tabs { position: static; }"),
    "右侧页签仍用绝对定位，会覆盖输入区或分镜内容",
  )
})

test("SDA14 左侧步骤的图标和文案必须作为一组垂直居中", () => {
  assert.ok(
    css.includes("flex: 0 0 auto !important;"),
    "图标或文案仍继承 flex: 1，会把整组内容顶到按钮上沿",
  )
  assert.ok(
    css.includes("justify-content: center;"),
    "步骤按钮没有明确设置整组内容居中",
  )
})

test("SDA15 顶栏额度、画布与完成状态必须作为一组靠最右", () => {
  assert.ok(
    css.includes(".signal-desk .h-quota { margin-left: auto; }"),
    "桌面顶栏右侧操作组没有推到最右侧",
  )
  assert.ok(
    css.includes(".signal-desk .h-canvas { margin-left: auto; }"),
    "中等宽度和手机端没有右侧操作组的自动推手",
  )
})

test("SDA16 高频展开动作必须共用可中断的柔和折叠容器", () => {
  assert.ok(collapseSrc.includes("smooth-collapse"), "缺少共享折叠容器")
  assert.ok(collapseSrc.includes("inert"), "折叠隐藏内容没有从键盘焦点中移除")
  for (const [name, source] of [
    ["项目菜单", projectSrc],
    ["灵感助手", ideaSrc],
    ["更新公告", releaseSrc],
    ["创作意图", briefSrc],
    ["待办", todoSrc],
    ["判断日志", judgmentSrc],
    ["视觉宪法", lookSrc],
    ["三幕", actSrc],
    ["分镜", shotSrc],
    ["影响明细", versionSrc],
    ["场记过程", agentSrc],
  ]) {
    assert.ok(source.includes("SmoothCollapse"), `${name}仍未改用柔和折叠`)
  }
  assert.ok(css.includes(".smooth-collapse"), "折叠容器缺少主题过渡样式")
})

test("SDA17 AI 场记输出必须有等待态、渐进落字和分段入场", () => {
  assert.ok(streamingSrc.includes("StreamingText"), "缺少流式文本组件")
  assert.ok(streamingSrc.includes("setTimeout"), "流式文本没有渐进更新机制")
  assert.ok(agentSrc.includes("<StreamingText"), "场记回答仍是整块突然出现")
  assert.ok(agentSrc.includes("agent-thinking"), "等待模型返回时没有连续反馈")
  assert.ok(css.includes(".agent-stream-caret"), "流式回答缺少光标反馈")
  assert.ok(css.includes("@keyframes agent-dot"), "等待态缺少呼吸点动画")
})

test("SDA18 画布进入和返回工作台必须都有平滑过渡", () => {
  assert.ok(projectCanvasSrc.includes("requestClose"), "画布关闭仍直接卸载")
  assert.ok(projectCanvasSrc.includes("is-closing"), "画布缺少退出状态")
  assert.ok(css.includes(".map-overlay.is-closing"), "画布退出过渡样式缺失")
  assert.ok(css.includes("@starting-style"), "画布首次进入缺少起始样式")
})

test("SDA19 场记正文必须字号协调，步骤和文档出处必须可点击跳转", () => {
  assert.ok(richTextSrc.includes("agent-inline-jump"), "步骤引用没有可点击跳转")
  assert.ok(richTextSrc.includes("agent-doc-link"), "文档出处没有可点击链接")
  assert.ok(agentSrc.includes("onOpenStep"), "场记没有接入步骤跳转回调")
  assert.ok(pageSrc.includes("onOpenStep"), "页面没有向场记传入步骤跳转")
  assert.ok(
    css.includes(".agent-stream-text") && css.includes("font-size: 11.5px"),
    "场记正文仍继承过大的基础字号",
  )
})
