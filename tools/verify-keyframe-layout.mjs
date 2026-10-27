import { chromium } from "playwright-core"
import fs from "node:fs"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
const baseUrl = process.env.KEYFRAME_VERIFY_BASE || "http://localhost:3241"
await page.goto(
  `${baseUrl}/`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
)
await page.evaluate(() => {
  const host = document.createElement("section")
  host.className = "keyframe-panel"
  host.dataset.layoutProbe = "true"
  host.style.width = "min(720px, 100%)"
  host.style.marginBottom = "600px"
  host.innerHTML = `
    <div class="keyframe-asset-summary mt-2.5 min-w-0">
      <div class="keyframe-preview keyframe-preview-landscape overflow-hidden rounded-chip border border-surface-line bg-surface-deep">
        <img class="h-full w-full object-cover" alt="">
      </div>
      <div class="min-w-0 self-center">
        <p>已采用 · 2026/10/27 23:50:50</p>
        <p>wanx2.1-t2i-turbo · 1514 KB</p>
        <a>下载场景图</a>
      </div>
    </div>`
  document.body.appendChild(host)
})
const imageData = `data:image/png;base64,${fs.readFileSync(
  "D:\\Project\\drama-outline\\data\\generated\\dbbf9a31-16c6-41dc-8e18-1e9ea993c57a\\888736a6-962d-49e8-9f94-8aa571ada2e5.png",
).toString("base64")}`
await page.locator(".keyframe-preview img").first().evaluate((image, src) => {
  image.src = src
}, imageData)
await page.locator(".keyframe-preview").first().waitFor()
await page.locator(".keyframe-asset-summary").first().scrollIntoViewIfNeeded()
await page.getByRole("button", { name: "知道了", exact: true }).click({ timeout: 1000 }).catch(() => {})
const report = await page.locator(".keyframe-preview").first().evaluate((preview) => {
  const parent = preview.parentElement
  const info = parent?.children[1]
  const previewRect = preview.getBoundingClientRect()
  const infoRect = info?.getBoundingClientRect()
  const parentStyle = parent ? getComputedStyle(parent) : null
  return {
    parentClass: parent?.className,
    parentDisplay: parentStyle?.display,
    gridTemplateColumns: parentStyle?.gridTemplateColumns,
    parentWidth: parent?.getBoundingClientRect().width,
    preview: { x: previewRect.x, y: previewRect.y, width: previewRect.width, height: previewRect.height },
    info: infoRect ? { x: infoRect.x, y: infoRect.y, width: infoRect.width, height: infoRect.height } : null,
    overlaps: Boolean(
      infoRect &&
      previewRect.right > infoRect.left &&
      previewRect.left < infoRect.right &&
      previewRect.bottom > infoRect.top &&
      previewRect.top < infoRect.bottom
    ),
  }
})
console.log(JSON.stringify(report, null, 2))
await page.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-keyframe-layout-after.png", fullPage: false })
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(100)
await page.locator(".keyframe-asset-summary").first().evaluate((node) => {
  node.scrollIntoView({ block: "center" })
})
const mobileReport = await page.locator(".keyframe-preview").first().evaluate((preview) => {
  const parent = preview.parentElement
  const info = parent?.children[1]
  const previewRect = preview.getBoundingClientRect()
  const infoRect = info?.getBoundingClientRect()
  return {
    parentDisplay: parent ? getComputedStyle(parent).display : null,
    gridTemplateColumns: parent ? getComputedStyle(parent).gridTemplateColumns : null,
    preview: { x: previewRect.x, y: previewRect.y, width: previewRect.width, height: previewRect.height },
    info: infoRect ? { x: infoRect.x, y: infoRect.y, width: infoRect.width, height: infoRect.height } : null,
    overlaps: Boolean(
      infoRect &&
      previewRect.right > infoRect.left &&
      previewRect.left < infoRect.right &&
      previewRect.bottom > infoRect.top &&
      previewRect.top < infoRect.bottom
    ),
  }
})
console.log(JSON.stringify({ mobile: mobileReport }, null, 2))
await page.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-keyframe-layout-mobile.png", fullPage: false })
await browser.close()
