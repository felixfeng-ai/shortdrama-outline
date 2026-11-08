import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3216"
const target = path.resolve("public/docs/tutorial/06-workspace-create.png")
const tempTarget = path.join(os.tmpdir(), "chengju-06-workspace-create.png")

const browser = await chromium.launch({
  executablePath: fs.existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
})

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  })
  const page = await context.newPage()

  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  const project = await page.evaluate(async () => {
    const response = await fetch("/api/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || "sample failed")
    return payload.data.project ?? payload.data
  })

  await page.goto(
    `${baseURL}/?project=${encodeURIComponent(project.id)}&view=create`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  )
  await page.locator(".skill-page-embedded").waitFor({ state: "visible", timeout: 20_000 })
  await page.locator(".skill-recommendations-grid > button").first().waitFor({
    state: "visible",
    timeout: 20_000,
  })

  const preflight = page.locator(".intake-preflight")
  await preflight.waitFor({ state: "visible", timeout: 10_000 })
  if (await preflight.getAttribute("open") !== null) {
    throw new Error("教程截图中的执行准备应保持默认折叠")
  }

  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }))
  await page.waitForTimeout(350)
  await page.screenshot({
    path: tempTarget,
    fullPage: false,
    animations: "disabled",
  })
  fs.copyFileSync(tempTarget, target)
  console.log(JSON.stringify({ projectId: project.id, screenshot: target }, null, 2))
} finally {
  await browser.close()
}
