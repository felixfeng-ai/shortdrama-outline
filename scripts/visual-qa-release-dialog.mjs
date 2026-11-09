import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3291"
const tutorialImage = path.resolve("public", "docs", "tutorial", "10-release-notes.png")
const outputDir = path.resolve(".tmp-visual-qa", "release-dialog")
fs.mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: fs.existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
})

async function createSampleProject(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || "sample failed")
    return payload.data.project ?? payload.data
  })
}

async function openRelease(page) {
  await page.getByRole("button", { name: "查看详情" }).click()
  const dialog = page.locator(".release-dialog")
  await dialog.waitFor({ state: "visible", timeout: 10_000 })
  return dialog
}

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  })
  const page = await context.newPage()
  const errors = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  const project = await createSampleProject(page)
  await page.goto(
    `${baseURL}/?project=${encodeURIComponent(project.id)}`,
    { waitUntil: "networkidle", timeout: 30_000 },
  )

  const dialog = await openRelease(page)
  const desktop = await dialog.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bodyOverflow: document.body.style.overflow,
      activeLabel: document.activeElement?.getAttribute("aria-label"),
    }
  })
  if (desktop.bodyOverflow !== "hidden") throw new Error("公告弹框未锁定背景滚动")
  if (desktop.width > desktop.viewportWidth || desktop.height > desktop.viewportHeight) {
    throw new Error(`公告弹框超出桌面视口：${JSON.stringify(desktop)}`)
  }
  if (desktop.activeLabel !== "关闭公告详情") {
    throw new Error(`公告弹框初始焦点错误：${desktop.activeLabel}`)
  }

  await page.keyboard.press("Shift+Tab")
  const wrappedToPrimary = await page.evaluate(() =>
    document.activeElement?.textContent?.includes("知道了") === true,
  )
  if (!wrappedToPrimary) throw new Error("公告弹框 Shift+Tab 焦点陷阱失效")
  await page.keyboard.press("Tab")
  const wrappedToClose = await page.evaluate(() =>
    document.activeElement?.getAttribute("aria-label") === "关闭公告详情",
  )
  if (!wrappedToClose) throw new Error("公告弹框 Tab 焦点陷阱失效")

  await page.screenshot({ path: tutorialImage, fullPage: false, animations: "disabled" })
  await page.keyboard.press("Escape")
  await dialog.waitFor({ state: "detached", timeout: 5_000 })
  const escaped = await page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow,
    activeText: document.activeElement?.textContent?.trim(),
  }))
  if (escaped.bodyOverflow !== "" || escaped.activeText !== "查看详情") {
    throw new Error(`公告弹框关闭后焦点或滚动未恢复：${JSON.stringify(escaped)}`)
  }

  await page.goto(`${baseURL}/docs`, { waitUntil: "networkidle", timeout: 30_000 })
  await page.locator("#release-notes").scrollIntoViewIfNeeded()
  const tutorialImageLoaded = await page.locator('#release-notes img[src="/docs/tutorial/10-release-notes.png"]').evaluate((image) =>
    image.complete && image.naturalWidth > 0
      ? true
      : new Promise((resolve) => {
          image.addEventListener("load", () => resolve(true), { once: true })
          image.addEventListener("error", () => resolve(false), { once: true })
        }),
  )
  if (!tutorialImageLoaded) throw new Error("教程公告截图加载失败")
  await page.screenshot({
    path: path.join(outputDir, "docs-release-section-desktop.png"),
    fullPage: false,
    animations: "disabled",
  })
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }))
  await page.screenshot({
    path: path.join(outputDir, "docs-hero-desktop.png"),
    fullPage: false,
    animations: "disabled",
  })

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  })
  const mobile = await mobileContext.newPage()
  await mobile.goto(
    `${baseURL}/?project=${encodeURIComponent(project.id)}`,
    { waitUntil: "networkidle", timeout: 30_000 },
  )
  const mobileDialog = await openRelease(mobile)
  const mobileMetrics = await mobileDialog.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const closeRect = node
      .querySelector('[aria-label="关闭公告详情"]')
      ?.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      closeWidth: closeRect?.width ?? 0,
      closeHeight: closeRect?.height ?? 0,
    }
  })
  if (
    mobileMetrics.scrollWidth > mobileMetrics.viewportWidth + 2
    || mobileMetrics.width > mobileMetrics.viewportWidth
    || mobileMetrics.height > mobileMetrics.viewportHeight
    || mobileMetrics.closeWidth < 44
    || mobileMetrics.closeHeight < 44
  ) {
    throw new Error(`公告弹框移动端尺寸异常：${JSON.stringify(mobileMetrics)}`)
  }
  await mobile.screenshot({
    path: path.join(outputDir, "release-dialog-mobile.png"),
    fullPage: false,
    animations: "disabled",
  })
  const mobileDocs = await mobileContext.newPage()
  await mobileDocs.goto(`${baseURL}/docs`, { waitUntil: "networkidle", timeout: 30_000 })
  const mobileDocsMetrics = await mobileDocs.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (mobileDocsMetrics.scrollWidth > mobileDocsMetrics.width + 2) {
    throw new Error(`教程移动端横向溢出：${JSON.stringify(mobileDocsMetrics)}`)
  }
  await mobileDocs.screenshot({
    path: path.join(outputDir, "docs-hero-mobile.png"),
    fullPage: false,
    animations: "disabled",
  })
  await mobileContext.close()

  if (errors.length > 0) throw new Error(`控制台错误：${errors.join(" | ")}`)
  console.log(JSON.stringify({ desktop, escaped, mobileMetrics, mobileDocsMetrics, outputDir }, null, 2))
} finally {
  await browser.close()
}
