import { chromium } from "playwright-core"
import fs from "node:fs"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const baseUrl = process.env.SKILL_DEMO_BASE || "http://127.0.0.1:3260"
const output = "D:\\Project\\drama-outline"
const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const errors = []
const page = await context.newPage()
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text())
})
page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 })
await page.locator('[data-skill="continuity"]').waitFor()
const skillCount = await page.locator(".skill-card").count()
if (skillCount !== 6) throw new Error(`技能卡数量不正确：${skillCount}`)
const imageCount = await page.locator(".skill-visual img").count()
if (imageCount !== 6) throw new Error(`技能缩略图数量不正确：${imageCount}`)
await page.getByRole("button", { name: "问场记" }).waitFor()

await page.locator('[data-skill="story-doctor"]').click()
await page.getByText("故事医生", { exact: true }).last().waitFor()
await page.locator('[data-category="交付效率"]').click()
if (await page.locator(".skill-card").count() !== 2) throw new Error("技能分类筛选不正确")
await page.locator('[data-category="全部"]').click()

const desktopOverflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (desktopOverflow.scrollWidth > desktopOverflow.clientWidth) throw new Error("桌面横向溢出")
await page.screenshot({ path: `${output}\\.tmp-skill-workflow-desktop.png` })

await page.locator('[data-skill="adaptation"]').click()
await page.locator("#sendButton").click()
await page.getByText("匹配 Skill · 小说 / 剧本改编").waitFor({ timeout: 10_000 })
await page.getByText("待确认 · 小说 / 剧本改编").waitFor({ timeout: 10_000 })
await page.screenshot({ path: `${output}\\.tmp-skill-workflow-agent.png` })

const mobile = await context.newPage()
mobile.on("console", (message) => {
  if (message.type() === "error") errors.push(`MOBILE: ${message.text()}`)
})
mobile.on("pageerror", (error) => errors.push(`MOBILE PAGEERROR: ${error.message}`))
await mobile.setViewportSize({ width: 390, height: 844 })
await mobile.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 })
await mobile.locator('[data-skill="continuity"]').waitFor()
if (await mobile.locator(".skill-visual img").count() !== 6) throw new Error("移动端技能缩略图不完整")
await mobile.getByRole("button", { name: "问场记" }).waitFor()
const mobileOverflow = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth) throw new Error("手机横向溢出")
await mobile.screenshot({ path: `${output}\\.tmp-skill-workflow-mobile.png`, fullPage: true })

console.log(JSON.stringify({
  skillCount,
  desktopOverflow,
  mobileOverflow,
  errors,
}, null, 2))
await browser.close()
