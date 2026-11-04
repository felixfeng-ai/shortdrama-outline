import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3217"
const outputDir = path.resolve(".tmp-visual-qa", "legal")
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
    const errors = []
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text())
    })

    for (const route of ["/legal", "/report", "/login"]) {
      const name = route.slice(1)
      errors.length = 0
      await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle", timeout: 30_000 })
      await page.screenshot({
        path: path.join(outputDir, `${viewport.name}-${name}.png`),
        fullPage: viewport.name === "mobile",
      })
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      if (overflow.scrollWidth > overflow.width + 2) {
        throw new Error(`${viewport.name} ${route} horizontal overflow ${JSON.stringify(overflow)}`)
      }
      if (errors.length > 0) {
        throw new Error(`${viewport.name} ${route} console errors: ${errors.join(" | ")}`)
      }
    }

    errors.length = 0
    await page.goto(baseURL, { waitUntil: "networkidle", timeout: 30_000 })
    const footer = page.locator(".site-legal-footer")
    await footer.waitFor({ state: "visible", timeout: 20_000 })
    await footer.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: path.join(outputDir, `${viewport.name}-home-footer.png`),
    })
    const footerLinks = await footer.locator("a").count()
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    if (overflow.scrollWidth > overflow.width + 2) {
      throw new Error(`${viewport.name} home horizontal overflow ${JSON.stringify(overflow)}`)
    }
    if (footerLinks < 5) {
      throw new Error(`${viewport.name} footer links missing`)
    }
    if (errors.length > 0) {
      throw new Error(`${viewport.name} home console errors: ${errors.join(" | ")}`)
    }
    results.push({ viewport: viewport.name, overflow, footerLinks })
    await context.close()
  }

  console.log(JSON.stringify({
    baseURL,
    results,
    screenshots: outputDir,
  }, null, 2))
} finally {
  await browser.close()
}
