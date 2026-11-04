import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3216"
const outputDir = path.resolve(".tmp-visual-qa", "release")
fs.mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
})

try {
  const results = []
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.goto(baseURL, { waitUntil: "networkidle", timeout: 30_000 })
    await page.locator(".release-trigger").click()
    const popover = page.locator(".release-popover")
    await popover.waitFor({ state: "visible", timeout: 10_000 })
    await popover.locator(".release-version", { hasText: "v2026.11.04" }).waitFor()
    await popover.locator("time", { hasText: "2026-11-04 23:53" }).waitFor()
    const highlights = await popover.locator(".release-highlights li").count()
    if (highlights !== 3) throw new Error(`${viewport.name}: expected 3 release highlights`)
    const box = await popover.boundingBox()
    if (!box || box.x < 0 || box.x + box.width > viewport.width + 1) {
      throw new Error(`${viewport.name}: release popover overflows ${JSON.stringify(box)}`)
    }
    await popover.screenshot({
      path: path.join(outputDir, `${viewport.name}-release.png`),
    })
    results.push({ viewport: viewport.name, box, highlights })
    await context.close()
  }
  console.log(JSON.stringify({ baseURL, results, outputDir }, null, 2))
} finally {
  await browser.close()
}
