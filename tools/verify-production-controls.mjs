import { chromium } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

import { readStoreZip } from "../lib/archive/zip.ts"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const baseUrl = process.env.CONTROLS_VERIFY_BASE || "http://localhost:3250"
const outputDir = "D:\\Project\\drama-outline"

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const errors = []
const page = await context.newPage()
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text())
})
page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 })
const sample = await context.request.post(`${baseUrl}/api/sample`)
const samplePayload = await sample.json()
const projectId = samplePayload?.data?.project?.id
if (!sample.ok() || !projectId) throw new Error("示例项目没有创建成功")

const shotsResponse = await context.request.get(
  `${baseUrl}/api/snapshots?projectId=${projectId}&kind=shots`,
)
const shotsPayload = await shotsResponse.json()
const shots = shotsPayload?.data?.snapshots?.[0]?.payload ?? []
const first = shots[0]
if (!first) throw new Error("示例项目缺少分镜")

await page.goto(
  `${baseUrl}/?step=shots&project=${projectId}&episode=${first.episode}&scene=${encodeURIComponent(first.scene)}`,
  { waitUntil: "domcontentloaded", timeout: 60_000 },
)
await page.locator(".shot-workbench").waitFor({ timeout: 60_000 })
await page.locator(".shot-qc-bar").waitFor()
await page.getByRole("button", { name: /仅看问题/ }).click()
await page.locator(".shot-board-card").first().waitFor()
const issueCards = await page.locator(".shot-board-card").count()
if (issueCards < 1) throw new Error("问题筛选后没有显示问题镜头")
if (await page.getByText("缺锚点").count() === 0 && await page.getByText("缺图").count() === 0) {
  throw new Error("镜头卡没有质量标签")
}

await page.locator(".project-backup").click()
await page.getByRole("button", { name: "即梦", exact: true }).click()
await page.getByText(/预检：/).first().waitFor()
const downloadPromise = page.waitForEvent("download", { timeout: 60_000 })
await page.getByRole("button", { name: "导出交付包" }).click()
const download = await downloadPromise
const downloadPath = path.join(outputDir, ".tmp-production-controls-delivery.zip")
await download.saveAs(downloadPath)

const zipBytes = fs.readFileSync(downloadPath)
const entries = await readStoreZip(new Blob([zipBytes]))
for (const expected of [
  "project.json",
  "production/jimeng/shotlist.txt",
  "production/jimeng/prompts.csv",
  "production/jimeng/preflight.json",
  "production/jimeng/manifest.json",
]) {
  if (!entries.has(expected)) throw new Error(`交付包缺少 ${expected}`)
}
const platformManifest = JSON.parse(
  new TextDecoder().decode(entries.get("production/jimeng/manifest.json")),
)
if (platformManifest.schema !== "chengju.platform-export" || platformManifest.target !== "jimeng") {
  throw new Error("平台导出 manifest 不正确")
}

const desktopOverflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (desktopOverflow.scrollWidth > desktopOverflow.clientWidth) throw new Error("桌面横向溢出")
await page.screenshot({ path: path.join(outputDir, ".tmp-production-controls-desktop.png") })

const mobile = await context.newPage()
mobile.on("console", (message) => {
  if (message.type() === "error") errors.push(`MOBILE: ${message.text()}`)
})
mobile.on("pageerror", (error) => errors.push(`MOBILE PAGEERROR: ${error.message}`))
await mobile.setViewportSize({ width: 390, height: 844 })
await mobile.goto(
  `${baseUrl}/?step=shots&project=${projectId}&episode=${first.episode}&scene=${encodeURIComponent(first.scene)}`,
  { waitUntil: "domcontentloaded", timeout: 60_000 },
)
await mobile.locator(".shot-workbench").waitFor()
await mobile.locator(".shot-qc-bar").waitFor()
await mobile.getByRole("button", { name: /仅看问题/ }).click()
await mobile.locator(".shot-board-card").first().click()
await mobile.getByRole("tab", { name: "镜头属性" }).waitFor()
await mobile.getByRole("heading", { name: "镜头质检" }).waitFor()
const mobileOverflow = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth) throw new Error("手机横向溢出")
await mobile.screenshot({ path: path.join(outputDir, ".tmp-production-controls-mobile.png") })

console.log(JSON.stringify({
  projectId,
  issueCards,
  zipEntries: entries.size,
  desktopOverflow,
  mobileOverflow,
  errors,
}, null, 2))
await browser.close()
