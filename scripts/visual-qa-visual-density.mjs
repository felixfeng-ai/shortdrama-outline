import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3216"
const outputDir = path.join(os.tmpdir(), "chengju-visual-density")
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

async function textMetrics(page) {
  return page.evaluate(() => {
    const selectors = "p,span,b,small,a,button,li,summary,h1,h2,h3,label,em"
    const sizes = Array.from(document.querySelectorAll(selectors))
      .filter((node) => {
        const style = window.getComputedStyle(node)
        const box = node.getBoundingClientRect()
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0
      })
      .map((node) => Number.parseFloat(window.getComputedStyle(node).fontSize))
      .filter(Number.isFinite)
    return {
      textNodes: sizes.length,
      under11: sizes.filter((size) => size < 11).length,
      under12: sizes.filter((size) => size < 12).length,
      under13: sizes.filter((size) => size < 13).length,
    }
  })
}

async function overflowMetrics(page) {
  return page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
}

try {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  })
  const desktopPage = await desktopContext.newPage()
  const errors = []
  desktopPage.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  desktopPage.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

  await desktopPage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  const project = await createSampleProject(desktopPage)

  await desktopPage.goto(
    `${baseURL}/skills?project=${encodeURIComponent(project.id)}`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  )
  const preflight = desktopPage.locator(".intake-preflight")
  await preflight.waitFor({ state: "visible", timeout: 20_000 })
  await desktopPage.locator(".skill-recommendations-grid > button").first().waitFor({
    state: "visible",
    timeout: 20_000,
  })
  if (await preflight.getAttribute("open") !== null) {
    throw new Error("desktop skill preflight should start collapsed")
  }
  await desktopPage.screenshot({
    path: path.join(outputDir, "skills-desktop-collapsed-1440.png"),
    fullPage: false,
  })
  await desktopPage.locator(".skill-recommendations-grid > button").first().dispatchEvent("click")
  await desktopPage.waitForFunction(
    () => document.querySelector(".intake-preflight")?.hasAttribute("open") === true,
    { timeout: 5_000 },
  )
  await desktopPage.screenshot({
    path: path.join(outputDir, "skills-desktop-1440.png"),
    fullPage: false,
  })

  await desktopPage.goto(
    `${baseURL}/?project=${encodeURIComponent(project.id)}&step=characters`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  )
  const workMeta = desktopPage.locator(".workmeta")
  await workMeta.waitFor({ state: "visible", timeout: 20_000 })
  const primaryLabels = await workMeta.locator(":scope > button").allTextContents()
  if (primaryLabels.length !== 3) {
    throw new Error(`workmeta should show three primary entries: ${JSON.stringify(primaryLabels)}`)
  }
  await workMeta.getByRole("button", { name: "更多" }).dispatchEvent("click")
  const morePanel = desktopPage.locator(".workmeta-more-panel")
  await morePanel.waitFor({ state: "visible", timeout: 5_000 })
  const moreLabels = await morePanel.locator("button").allTextContents()
  if (moreLabels.length !== 6) {
    throw new Error(`workmeta more panel is incomplete: ${JSON.stringify(moreLabels)}`)
  }
  await desktopPage.screenshot({
    path: path.join(outputDir, "workmeta-desktop-1440.png"),
    fullPage: false,
  })

  await desktopPage.goto(`${baseURL}/docs`, { waitUntil: "domcontentloaded", timeout: 30_000 })
  await desktopPage.locator(".docs-hero h1").waitFor({ state: "visible", timeout: 20_000 })
  await desktopPage.screenshot({
    path: path.join(outputDir, "docs-desktop-1440.png"),
    fullPage: false,
  })
  const workspaceDocs = desktopPage.locator("#workspace-modes")
  await workspaceDocs.waitFor({ state: "visible", timeout: 10_000 })
  await workspaceDocs.scrollIntoViewIfNeeded()
  await workspaceDocs.locator("img").evaluate(async (node) => {
    if (typeof node.decode === "function") await node.decode().catch(() => {})
  })
  await desktopPage.waitForTimeout(250)
  await desktopPage.screenshot({
    path: path.join(outputDir, "docs-workspace-modes-1440.png"),
    fullPage: false,
  })

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  })
  const mobilePage = await mobileContext.newPage()
  mobilePage.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  mobilePage.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))
  await mobilePage.goto(
    `${baseURL}/skills?project=${encodeURIComponent(project.id)}`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  )
  await mobilePage.locator(".skill-recommendations-grid > button").first().waitFor({
    state: "visible",
    timeout: 20_000,
  })
  const mobileSkillsMetrics = await textMetrics(mobilePage)
  if (await mobilePage.locator(".intake-preflight").getAttribute("open") !== null) {
    throw new Error("mobile skill preflight should start collapsed")
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, "skills-mobile-390.png"),
    fullPage: false,
  })

  await mobilePage.goto(
    `${baseURL}/?project=${encodeURIComponent(project.id)}&step=characters`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  )
  const mobileWorkMeta = mobilePage.locator(".workmeta")
  await mobileWorkMeta.waitFor({ state: "visible", timeout: 20_000 })
  await mobileWorkMeta.getByRole("button", { name: "更多" }).dispatchEvent("click")
  await mobilePage.locator(".workmeta-more-panel").waitFor({ state: "visible", timeout: 5_000 })
  await mobileWorkMeta.scrollIntoViewIfNeeded()
  await mobilePage.waitForTimeout(250)
  const mobileWorkMetaOverflow = await overflowMetrics(mobilePage)
  if (mobileWorkMetaOverflow.scrollWidth > mobileWorkMetaOverflow.width + 2) {
    throw new Error(`mobile workmeta overflow: ${JSON.stringify(mobileWorkMetaOverflow)}`)
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, "workmeta-mobile-390.png"),
    fullPage: false,
  })

  await mobilePage.goto(`${baseURL}/docs`, { waitUntil: "domcontentloaded", timeout: 30_000 })
  await mobilePage.locator(".docs-hero h1").waitFor({ state: "visible", timeout: 20_000 })
  const mobileDocsMetrics = await textMetrics(mobilePage)
  const mobileDocsOverflow = await overflowMetrics(mobilePage)
  if (mobileDocsOverflow.scrollWidth > mobileDocsOverflow.width + 2) {
    throw new Error(`mobile docs overflow: ${JSON.stringify(mobileDocsOverflow)}`)
  }
  const docsBodySize = await mobilePage.locator(".docs-steps p").first().evaluate(
    (node) => Number.parseFloat(window.getComputedStyle(node).fontSize),
  )
  if (docsBodySize < 13) throw new Error(`docs body is below 13px: ${docsBodySize}`)
  await mobilePage.screenshot({
    path: path.join(outputDir, "docs-mobile-390.png"),
    fullPage: false,
  })

  // Playwright 截图会临时隐藏输入光标，可能触发 React 的 hydration 提示；这不是页面运行错误。
  const actionableErrors = errors.filter((message) => !message.includes("A tree hydrated"))
  if (actionableErrors.length > 0) throw new Error(`console errors: ${actionableErrors.join(" | ")}`)

  console.log(JSON.stringify({
    projectId: project.id,
    primaryLabels,
    moreLabels,
    mobileSkillsMetrics,
    mobileWorkMetaOverflow,
    mobileDocsMetrics,
    mobileDocsOverflow,
    docsBodySize,
    screenshots: outputDir,
  }, null, 2))
} finally {
  await browser.close()
}
