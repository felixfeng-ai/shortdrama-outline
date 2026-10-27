import { chromium } from "playwright-core"
import fs from "node:fs"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const baseUrl = process.env.WORKBENCH_VERIFY_BASE || "http://localhost:3246"
const png = fs.readFileSync(
  "D:\\Project\\drama-outline\\data\\generated\\dbbf9a31-16c6-41dc-8e18-1e9ea993c57a\\888736a6-962d-49e8-9f94-8aa571ada2e5.png",
)

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text())
})
page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
const sample = await context.request.post(`${baseUrl}/api/sample`)
const samplePayload = await sample.json()
const projectId = samplePayload?.data?.project?.id
if (!sample.ok() || !projectId) throw new Error("示例项目没有创建成功")

const shotsResponse = await context.request.get(
  `${baseUrl}/api/snapshots?projectId=${projectId}&kind=shots`,
)
const shotsPayload = await shotsResponse.json()
const shots = shotsPayload?.data?.snapshots?.[0]?.payload ?? []
const generated = shots.slice(0, 2).map((shot, index) => ({
  id: `workbench-asset-${index + 1}`,
  taskId: `workbench-task-${index + 1}`,
  projectId,
  targetType: "shot",
  targetId: shot.entityId,
  storageKey: `mock/${index + 1}.png`,
  mime: "image/png",
  bytes: png.length,
  providerId: "aliyun",
  model: "wanx2.1-t2i-turbo",
  prompt: shot.prompt || "prompt",
  selectedAt: Date.now(),
  createdAt: Date.now(),
  downloadUrl: `/api/generated-assets/workbench-asset-${index + 1}`,
}))

await context.route("**/api/generations*", async (route) => {
  const url = new URL(route.request().url())
  const targetType = url.searchParams.get("targetType")
  const targetId = url.searchParams.get("targetId")
  const assets = generated.filter((asset) =>
    (!targetType || asset.targetType === targetType) &&
    (!targetId || asset.targetId === targetId))
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { tasks: [], assets },
    }),
  })
})
await context.route("**/api/generated-assets/**", (route) =>
  route.fulfill({ status: 200, contentType: "image/png", body: png }))

const shotId = shots[0]?.id
const firstScene = shots[0]?.scene
await page.goto(
  `${baseUrl}/?step=shots&project=${projectId}&episode=${shots[0]?.episode ?? 1}` +
    `&scene=${encodeURIComponent(firstScene || "")}&shot=${shotId || ""}`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
)
await page.locator(".shot-workbench").waitFor({ timeout: 60000 })
await page.locator(".shot-tree").waitFor()
await page.locator(".shot-board-card").first().waitFor()

const firstEpisode = page.locator(".shot-tree-episode-head").first()
await firstEpisode.click()
const firstSceneButton = page.locator(".shot-tree-scene > button").first()
await firstSceneButton.click()
const firstTreeShot = page.locator(".shot-tree-scene > div button").first()
await firstTreeShot.click()

await page.getByRole("tab", { name: "镜头属性" }).waitFor()
await page.getByRole("heading", { name: /第 \d+ 镜/ }).last().waitFor()
if (!(await page.getByText("本镜 Prompt").isVisible())) throw new Error("右侧镜头属性没有显示")
const desktopOverflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (desktopOverflow.scrollWidth > desktopOverflow.clientWidth) throw new Error("桌面横向溢出")
const thumbnailCount = await page.locator(".shot-board-thumb img").count()
if (thumbnailCount < 1) throw new Error("镜头卡没有显示首帧缩略图")
await page.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-production-workbench-desktop.png" })

const mobile = await context.newPage()
await mobile.setViewportSize({ width: 390, height: 844 })
mobile.on("console", (message) => {
  if (message.type() === "error") errors.push(`MOBILE: ${message.text()}`)
})
await mobile.goto(
  `${baseUrl}/?step=shots&project=${projectId}&episode=${shots[0]?.episode ?? 1}` +
    `&scene=${encodeURIComponent(firstScene || "")}`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
)
await mobile.locator(".shot-workbench").waitFor()
await mobile.locator(".shot-board-card").first().waitFor()
await mobile.locator(".shot-board-thumb img").first().waitFor({ timeout: 10000 })
await mobile.locator(".shot-board-card").first().scrollIntoViewIfNeeded()
await mobile.waitForTimeout(150)
await mobile.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-production-workbench-mobile-board.png" })
await mobile.locator(".shot-board-card").first().click()
await mobile.getByRole("tab", { name: "镜头属性" }).waitFor()
const mobileOverflow = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth) throw new Error("手机横向溢出")
await mobile.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-production-workbench-mobile.png" })

console.log(JSON.stringify({
  projectId,
  shotId,
  thumbnailCount,
  desktopOverflow,
  mobileOverflow,
  errors,
}, null, 2))
await browser.close()
