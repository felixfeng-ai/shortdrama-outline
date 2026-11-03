import { chromium } from "playwright-core"
import fs from "node:fs"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const baseUrl = process.env.SKILL_CHAIN_BASE || "http://localhost:3266"
const output = "D:\\Project\\drama-outline"

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const errors = []
const page = await context.newPage()
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text())
})
page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 })
const sampleResponse = await context.request.post(`${baseUrl}/api/sample`)
const samplePayload = await sampleResponse.json()
const project = samplePayload?.data?.project
if (!sampleResponse.ok() || !project?.id) throw new Error("示例项目没有创建成功")

await page.goto(`${baseUrl}/?project=${encodeURIComponent(project.id)}&step=shots`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
})
await page.locator(".shot-workbench").waitFor({ timeout: 60_000 })
const skillLink = page.getByRole("link", { name: "打开 Skill 创作入口" })
await skillLink.click()
await page.waitForURL((url) => url.pathname === "/skills" && url.searchParams.get("project") === project.id)
await page.locator(".skill-card").first().waitFor()
await page.getByText(project.title, { exact: true }).first().waitFor()

const snapshotsBefore = await context.request.get(
  `${baseUrl}/api/snapshots?projectId=${encodeURIComponent(project.id)}&kind=shots`,
)
const snapshotsBeforeText = await snapshotsBefore.text()
const quotaBefore = await context.request
  .get(`${baseUrl}/api/quota`)
  .then((response) => response.json())

await page.locator(".skill-card").filter({ hasText: "镜头连续性检查" }).click()
await page.locator("#skill-prompt").fill("检查当前分镜的首尾帧、角色锚点和参考图版本。")
const startedAt = Date.now()
await page.locator(".send-button").click()
await page.locator(".agent-drawer.open").waitFor({ timeout: 15_000 })
await page.getByText("已读取当前项目，写项目前一定问你").waitFor({ timeout: 15_000 })
await page.locator(".continuity-report").waitFor({ timeout: 120_000 })
await page.locator(".agent-ready").filter({ hasText: "READY" }).waitFor({ timeout: 120_000 })
const reportText = (await page.locator(".continuity-report").textContent())?.trim() ?? ""
const reportRows = await page.locator(".continuity-row").count()
if (!reportText.includes("镜头连续性检查")) throw new Error("没有展示连续性报告")
if (!reportText.includes("只读检查")) throw new Error("报告没有标记只读")
if (!reportText.includes("写入 否")) throw new Error("报告没有标记零写入")
if (!reportText.includes("额度消耗 0")) throw new Error("报告没有标记零额度")
if (!reportText.includes("第 3 集")) throw new Error("报告没有定位到第 3 集")
if (!reportText.includes("苏婉")) throw new Error("报告没有指出苏婉缺参考图")
if (reportRows === 0) throw new Error("返修队列为空")

const snapshotsAfter = await context.request.get(
  `${baseUrl}/api/snapshots?projectId=${encodeURIComponent(project.id)}&kind=shots`,
)
const snapshotsAfterText = await snapshotsAfter.text()
if (snapshotsAfterText !== snapshotsBeforeText) throw new Error("只读 Skill 链路意外修改了分镜快照")
const quotaAfter = await context.request
  .get(`${baseUrl}/api/quota`)
  .then((response) => response.json())
if (quotaAfter?.data?.remaining !== quotaBefore?.data?.remaining) {
  throw new Error("确定性连续性 Runner 意外消耗了额度")
}

await page.screenshot({ path: `${output}\\.tmp-skill-continuity-runner.png` })

await page.getByRole("button", { name: "关闭场记" }).click()
await page.getByRole("button", { name: "取消选择技能" }).click()
await page.getByRole("button", { name: "问场记" }).click()
await page.locator(".agent-drawer.open").waitFor()
await page.locator("#skill-agent-input").fill("现在还有哪些要处理？请查项目状态。")
await page.locator(".agent-compose button[type=submit]").click()
await page.locator(".process-row").first().waitFor({ timeout: 120_000 })
await page.locator(".agent-ready").filter({ hasText: "READY" }).waitFor({ timeout: 120_000 })
const assistantMessages = page.locator(".agent-messages .assistant-message")
await assistantMessages.last().waitFor({ timeout: 120_000 })
const agentReply = (await assistantMessages.last().textContent())?.trim() ?? ""
const toolTraceCount = await page.locator(".process-row").count()
if (!agentReply) throw new Error("场记没有返回内容")
if (toolTraceCount === 0) throw new Error("场记没有调用项目工具")
const quotaAfterAgent = await context.request
  .get(`${baseUrl}/api/quota`)
  .then((response) => response.json())

await page.screenshot({ path: `${output}\\.tmp-skill-chain-agent.png` })
await page.getByRole("button", { name: "关闭场记" }).click()
await page.getByRole("link", { name: "项目", exact: true }).click()
await page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("project") === project.id)
await page.getByText(project.title, { exact: true }).first().waitFor({ timeout: 60_000 })

const mobile = await context.newPage()
mobile.on("console", (message) => {
  if (message.type() === "error") errors.push(`MOBILE: ${message.text()}`)
})
mobile.on("pageerror", (error) => errors.push(`MOBILE PAGEERROR: ${error.message}`))
await mobile.setViewportSize({ width: 390, height: 844 })
await mobile.goto(`${baseUrl}/skills?project=${encodeURIComponent(project.id)}`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
})
await mobile.locator(".skill-card").filter({ hasText: "镜头连续性检查" }).click()
await mobile.locator(".send-button").click()
await mobile.locator(".continuity-report").waitFor({ timeout: 120_000 })
await mobile.locator(".agent-ready").filter({ hasText: "READY" }).waitFor({ timeout: 120_000 })
const mobileOverflow = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth) throw new Error("手机连续性报告横向溢出")
if (await mobile.locator(".continuity-row").count() === 0) throw new Error("手机连续性报告没有返修项")
await mobile.screenshot({ path: `${output}\\.tmp-skill-continuity-mobile.png`, fullPage: true })

console.log(JSON.stringify({
  projectId: project.id,
  projectTitle: project.title,
  reportRows,
  reportText,
  deterministicQuotaUnchanged: quotaAfter?.data?.remaining === quotaBefore?.data?.remaining,
  toolTraceCount,
  agentReply,
  elapsedMs: Date.now() - startedAt,
  quotaBefore: quotaBefore?.data?.remaining,
  quotaAfter: quotaAfter?.data?.remaining,
  quotaAfterAgent: quotaAfterAgent?.data?.remaining,
  mobileOverflow,
  snapshotsUnchanged: snapshotsAfterText === snapshotsBeforeText,
  returnedProjectId: new URL(page.url()).searchParams.get("project"),
  errors,
}, null, 2))
await browser.close()
