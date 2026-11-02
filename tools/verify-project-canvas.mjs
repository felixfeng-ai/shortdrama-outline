import { chromium } from "playwright-core"
import fs from "node:fs"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const baseUrl = process.env.CANVAS_VERIFY_BASE || "http://localhost:3252"
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
const sample = await context.request.post(`${baseUrl}/api/sample`)
const payload = await sample.json()
const projectId = payload?.data?.project?.id
if (!sample.ok() || !projectId) throw new Error("示例项目没有创建成功")

await page.goto(`${baseUrl}/?step=shots&project=${projectId}`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
})
await page.locator(".shot-workbench").waitFor({ timeout: 60_000 })
await page.getByRole("button", { name: "打开项目画布" }).first().click()
await page.locator(".map-overlay").waitFor()
await page.locator(".map-priority").waitFor()
const priorityCount = await page.locator(".map-priority-list button").count()
if (priorityCount < 1) throw new Error("画布没有显示优先处理项")

const shotAction = page.locator(".map-priority-list button").filter({ hasText: "分镜" }).first()
if (await shotAction.count() === 0) throw new Error("优先处理中没有分镜问题")
await shotAction.click()
await page.locator(".map-overlay").waitFor({ state: "detached" })
await page.waitForFunction(() => {
  const active = document.activeElement
  return active instanceof HTMLElement && Boolean(active.dataset.canvasItem)
})
const focusedItem = await page.evaluate(() => {
  const active = document.activeElement
  return active instanceof HTMLElement ? active.dataset.canvasItem ?? "" : ""
})
const currentUrl = new URL(page.url())
if (!currentUrl.searchParams.get("shot")) throw new Error("精确定位没有写入镜头深链")

await context.route("**/api/generations*", async (route) => {
  const url = new URL(route.request().url())
  const targetProject = url.searchParams.get("projectId") || projectId
  const base = {
    projectId: targetProject,
    providerId: "aliyun",
    model: "mock",
    prompt: "mock",
    promptHash: "mock",
    assetId: null,
    createdAt: Date.now() - 10_000,
    startedAt: Date.now() - 9_000,
    finishedAt: null,
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: {
        tasks: [
          { ...base, id: "task-char", targetType: "character", targetId: "mock-character", status: "failed", error: "mock failed" },
          { ...base, id: "task-place", targetType: "place", targetId: "mock-place", status: "running", error: null },
          { ...base, id: "task-shot", targetType: "shot", targetId: "mock-shot", status: "running", error: null },
        ],
        assets: [],
      },
    }),
  })
})

await page.getByRole("button", { name: "打开项目画布" }).first().click()
await page.locator(".map-overlay").waitFor()
await page.getByText("1 个失败", { exact: true }).waitFor()
await page.locator(".map-node-task").first().waitFor()
const desktopOverflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (desktopOverflow.scrollWidth > desktopOverflow.clientWidth) throw new Error("桌面画布横向溢出")
await page.screenshot({ path: `${output}\\.tmp-project-canvas-desktop.png` })

await page.locator('.map-node[data-map-node="shots"]').click()
await page.locator(".canvas-preview-scope select").first().selectOption({ label: "第 3 集" })
await page.waitForTimeout(120)
const scopedShotTitles = await page.locator(".map-preview-title b").allTextContents()
const scopedShotRows = await page.locator(".map-preview-row").allTextContents()
if (scopedShotRows.length === 0 || scopedShotRows.some((text) => !text.includes("第 3 集"))) {
  throw new Error(`分集下钻结果不正确：${scopedShotRows.join(" / ")}`)
}
await page.screenshot({ path: `${output}\\.tmp-project-canvas-scope-desktop.png` })

const mobile = await context.newPage()
mobile.on("console", (message) => {
  if (message.type() === "error") errors.push(`MOBILE: ${message.text()}`)
})
mobile.on("pageerror", (error) => errors.push(`MOBILE PAGEERROR: ${error.message}`))
await mobile.setViewportSize({ width: 390, height: 844 })
await mobile.goto(`${baseUrl}/?step=shots&project=${projectId}`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
})
await mobile.locator(".shot-workbench").waitFor({ timeout: 60_000 })
await mobile.getByRole("button", { name: "打开项目画布" }).first().click()
await mobile.locator(".map-priority").waitFor()
await mobile.waitForTimeout(320)
const mobileNodeOrder = await mobile.locator(".map-row b").allTextContents()
const expectedOrder = ["核心人物", "三幕大纲", "分集剧情", "视觉定妆", "场景", "地点锚点", "分镜"]
if (JSON.stringify(mobileNodeOrder) !== JSON.stringify(expectedOrder)) {
  throw new Error(`移动端流程顺序不正确：${mobileNodeOrder.join(" → ")}`)
}
const mobileOverflow = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth) throw new Error("手机画布横向溢出")
await mobile.screenshot({ path: `${output}\\.tmp-project-canvas-mobile.png` })

console.log(JSON.stringify({
  projectId,
  priorityCount,
  focusedItem,
  shotDeepLink: currentUrl.searchParams.get("shot"),
  mobileNodeOrder,
  scopedShotTitles,
  desktopOverflow,
  mobileOverflow,
  errors,
}, null, 2))
await browser.close()
