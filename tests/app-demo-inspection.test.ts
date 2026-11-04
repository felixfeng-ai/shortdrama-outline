import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const component = fs.readFileSync("components/DoubaoStyleAgentApp.tsx", "utf8")
const styles = fs.readFileSync("components/DoubaoStyleAgentApp.module.css", "utf8")

test("D1 项目面板具备焦点进入、焦点陷阱、Esc 关闭与焦点返还", () => {
  assert.ok(component.includes("dialogRef"), "项目面板缺少对话框引用")
  assert.ok(component.includes("Escape"), "项目面板没有处理 Esc")
  assert.ok(component.includes("focus()"), "项目面板没有恢复焦点")
  assert.ok(component.includes("onKeyDown"), "项目面板没有键盘事件")
  assert.ok(component.includes("aria-expanded"), "项目入口缺少展开状态")
})

test("D2 输入框支持自动增高、Enter 发送与 Shift+Enter 换行", () => {
  assert.ok(component.includes("scrollHeight"), "输入框没有自动增高")
  assert.ok(component.includes("requestSubmit"), "Enter 没有触发表单提交")
  assert.ok(component.includes("shiftKey"), "没有保留 Shift+Enter 换行")
  assert.ok(component.includes("matchMedia"), "滚动没有尊重 reduced-motion")
})

test("D3 品牌首页、项目切换和创作决策都有可执行反馈", () => {
  assert.ok(component.includes("activeProject"), "项目选择没有更新当前项目")
  assert.ok(component.includes("resetConversation"), "品牌标没有回到首页")
  assert.ok(component.includes("decision"), "创作决策没有状态")
  assert.ok(!component.includes("<button type=\"button\">稍后决定</button>"), "稍后决定仍是无响应按钮")
})

test("D4 关键中文操作字号上调，并保留移动端安全区", () => {
  assert.match(styles, /\.quietPrompts button\s*\{[\s\S]*?font-size:\s*12px;/, "快捷提示仍小于 12px")
  assert.match(styles, /\.threadContext\s*\{[^}]*font-size:\s*11px;/, "对话上下文仍过小")
  assert.match(styles, /\.composerContext\s*\{[^}]*font-size:\s*11px;/, "输入上下文仍过小")
  assert.ok(styles.includes("env(safe-area-inset-bottom)"), "底部输入区缺少安全区")
  assert.ok(styles.includes("prefers-reduced-motion"), "缺少 reduced-motion 兜底")
})

test("D5 模式切换回到阅读顶部，展开明细后自动滚入可见区", () => {
  assert.ok(component.includes("mainRef"), "主内容区缺少滚动引用")
  assert.ok(component.includes("changeDetailsRef"), "改动明细缺少滚动引用")
  assert.ok(component.includes("scrollTo"), "模式切换没有复位滚动位置")
  assert.ok(component.includes("scrollIntoView"), "展开明细没有滚入可见区")
})

test("D6 登录占位改为可解释、可关闭的本机会话面板", () => {
  assert.ok(component.includes("accountOpen"), "缺少本机会话面板状态")
  assert.ok(component.includes("accountPill"), "顶栏仍使用登录占位样式")
  assert.ok(component.includes("本机创作会话"), "没有说明匿名本机会话")
  assert.ok(component.includes("图片"), "没有说明本地图片边界")
})

test("D7 附件菜单只登记本地元数据，并随消息展示", () => {
  assert.ok(component.includes("fileInputRef"), "缺少本地文件输入")
  assert.ok(component.includes('accept="image/*"'), "没有限制本地图片类型")
  assert.ok(component.includes("attachments"), "消息没有携带附件")
  assert.ok(component.includes("removeAttachment"), "附件无法移除")
  assert.ok(component.includes("attachmentMenu"), "加号没有可操作的附件菜单")
})

test("D8 语音输入有开始、停止与不支持时的恢复状态", () => {
  assert.ok(component.includes("SpeechRecognition"), "没有接入浏览器语音识别")
  assert.ok(component.includes("voiceNotice"), "不支持语音时没有恢复提示")
  assert.ok(component.includes("aria-pressed"), "麦克风没有录制状态")
  assert.ok(component.includes("停止语音输入"), "录音中无法停止")
})
