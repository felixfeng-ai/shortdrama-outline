import { chromium } from "playwright-core"
import fs from "node:fs"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const baseUrl = process.env.BETA_VERIFY_BASE || "http://localhost:3270"
const output = "D:\\Project\\drama-outline"

const browser = await chromium.launch({ executablePath, headless: true })
const errors = []

const freshContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: {
    "x-forwarded-host": "beta-readiness.example.com",
    "x-forwarded-proto": "https",
  },
})
const fresh = await freshContext.newPage()
fresh.on("console", (message) => {
  if (message.type() === "error") errors.push(`FRESH: ${message.text()}`)
})
fresh.on("pageerror", (error) => errors.push(`FRESH PAGEERROR: ${error.message}`))
await fresh.goto(`${baseUrl}/skills`, { waitUntil: "networkidle" })
if ((await fresh.locator(".top-project").textContent())?.trim() !== "还没有项目") {
  throw new Error("独立会话没有进入无项目状态")
}
if (await fresh.getByRole("button", { name: "添加项目原文" }).isEnabled()) {
  throw new Error("无项目时原文入口仍可点击")
}
if (await fresh.locator(".send-button").isEnabled()) {
  throw new Error("空输入时发送按钮仍可点击")
}
await fresh.getByRole("button", { name: "新建项目" }).click()
await fresh.locator(".top-project").filter({ hasText: "未命名项目" }).waitFor({ timeout: 15_000 })
if (!(await fresh.getByRole("button", { name: "添加项目原文" }).isEnabled())) {
  throw new Error("创建项目后原文入口没有解锁")
}

await fresh.goto(`${baseUrl}/legal`, { waitUntil: "networkidle" })
await fresh.getByRole("heading", { name: "内测版隐私、条款与内容规则" }).waitFor()
await fresh.goto(`${baseUrl}/report`, { waitUntil: "networkidle" })
await fresh.getByRole("heading", { name: "举报侵权或不当内容" }).waitFor()

const sampleContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await sampleContext.request.get(`${baseUrl}/skills`)
const sampleResponse = await sampleContext.request.post(`${baseUrl}/api/sample`)
const sampleProject = (await sampleResponse.json()).data.project
const workspace = await sampleContext.newPage()
workspace.on("console", (message) => {
  if (message.type() === "error") errors.push(`WORKSPACE: ${message.text()}`)
})
workspace.on("pageerror", (error) => errors.push(`WORKSPACE PAGEERROR: ${error.message}`))
await workspace.goto(`${baseUrl}/skills?project=${sampleProject.id}`, { waitUntil: "networkidle" })

await workspace.locator(".skill-card").filter({ hasText: "平台交付预检" }).click()
await workspace.locator(".send-button").click()
await workspace.locator(".deterministic-report").waitFor({ timeout: 30_000 })
const deliveryText = (await workspace.locator(".deterministic-report").textContent())?.trim() ?? ""
if (!deliveryText.includes("0 模型调用") || !deliveryText.includes("阻断")) {
  throw new Error("交付预检没有返回确定性报告")
}
await workspace.getByRole("button", { name: "关闭场记" }).click()

await workspace.locator(".skill-card").filter({ hasText: "成本规划" }).click()
await workspace.locator(".send-button").click()
await workspace.locator(".deterministic-report").last().waitFor({ timeout: 30_000 })
const costText = (await workspace.locator(".deterministic-report").last().textContent())?.trim() ?? ""
if (!costText.includes("预计总成本") || !costText.includes("0 模型调用")) {
  throw new Error("成本规划没有返回确定性报告")
}
await workspace.screenshot({ path: `${output}\\.tmp-beta-deterministic-skills.png` })

await workspace.getByRole("button", { name: "关闭场记" }).click()
await workspace.waitForFunction(() => !document.querySelector(".agent-drawer")?.classList.contains("open"))
const trigger = workspace.getByRole("button", { name: "问场记" })
await trigger.click()
await workspace.locator(".agent-drawer.open").waitFor()
await workspace.keyboard.press("Escape")
await workspace.waitForFunction(() => !document.querySelector(".agent-drawer")?.classList.contains("open"))
const focusReturned = await workspace.evaluate(() => document.activeElement?.classList.contains("agent-entry") ?? false)
if (!focusReturned) throw new Error("关闭场记后焦点没有回到触发按钮")

const mobile = await sampleContext.newPage()
await mobile.setViewportSize({ width: 390, height: 844 })
await mobile.goto(`${baseUrl}/skills?project=${sampleProject.id}`, { waitUntil: "networkidle" })
const visibleToolLabels = await mobile.locator(".tool-button span").evaluateAll((items) =>
  items.filter((item) => {
    const rect = item.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && getComputedStyle(item).display !== "none"
  }).map((item) => item.textContent?.trim() ?? ""),
)
if (visibleToolLabels.length < 3) throw new Error("手机工具按钮没有保留文字")
const mobileOverflow = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth) throw new Error("手机页面横向溢出")

console.log(JSON.stringify({
  emptyStateGuarded: true,
  legalRoutes: true,
  deliveryZeroModel: deliveryText.includes("0 模型调用"),
  costZeroModel: costText.includes("0 模型调用"),
  focusReturned,
  visibleToolLabels,
  mobileOverflow,
  errors,
}, null, 2))
await browser.close()
