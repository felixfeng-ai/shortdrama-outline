import { chromium } from "playwright-core"
import fs from "node:fs"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const baseUrl = process.env.SCENE_VERIFY_BASE || "http://localhost:3242"
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

await page.goto(`${baseUrl}/?step=scenes&project=${projectId}`, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.getByRole("heading", { name: "生成场次剧本" }).waitFor({ timeout: 60000 })
const firstCard = page.locator(".scene-card").first()
await firstCard.scrollIntoViewIfNeeded()
const text = await firstCard.innerText()
for (const label of ["场 1", "场次剧本", "第 1 集", "本场剧情", "本场出场", "这一场会拆成多个镜头"]) {
  if (!text.includes(label)) throw new Error(`场次卡缺少 ${label}`)
}
const desktopOverflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (desktopOverflow.scrollWidth > desktopOverflow.clientWidth) throw new Error("桌面横向溢出")
await page.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-scene-clarity-desktop.png" })

await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(200)
await firstCard.scrollIntoViewIfNeeded()
const mobileBoxes = await firstCard.evaluate((card) => {
  const summary = card.querySelector(".scene-card-summary")?.getBoundingClientRect()
  const cast = card.querySelector(".scene-card-cast")?.getBoundingClientRect()
  return {
    card: card.getBoundingClientRect().toJSON(),
    summary: summary?.toJSON(),
    cast: cast?.toJSON(),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }
})
if (mobileBoxes.scrollWidth > mobileBoxes.clientWidth) throw new Error("手机横向溢出")
if (mobileBoxes.summary && mobileBoxes.cast && mobileBoxes.summary.bottom > mobileBoxes.cast.top) {
  throw new Error("剧情与出场区域发生重叠")
}
await page.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-scene-clarity-mobile.png" })

console.log(JSON.stringify({ projectId, desktopOverflow, mobileBoxes, errors }, null, 2))
await browser.close()
