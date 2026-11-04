import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3216"
const outputDir = path.resolve(".tmp-visual-qa", "project-navigation")
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

function stepOf(url) {
  return new URL(url).searchParams.get("step")
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  const project = await createSampleProject(page)
  const workbenchURL = `${baseURL}/?project=${encodeURIComponent(project.id)}&step=episodes`
  await page.goto(workbenchURL, { waitUntil: "networkidle", timeout: 30_000 })

  await page.getByRole("link", { name: "打开 Skill 创作入口" }).click()
  await page.waitForURL(/\/skills\?/, { timeout: 10_000 })
  const skillsURL = new URL(page.url())
  if (skillsURL.searchParams.get("project") !== project.id || stepOf(page.url()) !== "episodes") {
    throw new Error(`Skill navigation lost context: ${page.url()}`)
  }
  await page.locator(".skill-recommendations-grid > button").first().waitFor({
    state: "visible",
    timeout: 20_000,
  })
  await page.screenshot({
    path: path.join(outputDir, "skill-context-desktop.png"),
    fullPage: false,
  })

  await page.locator(".top-nav a").filter({ hasText: "画布" }).click()
  await page.waitForURL(/view=canvas/, { timeout: 10_000 })
  if (stepOf(page.url()) !== "episodes") throw new Error(`Canvas lost step: ${page.url()}`)
  await page.locator(".map-overlay").waitFor({ state: "visible", timeout: 20_000 })
  await page.locator(".map-project-context strong").filter({ hasText: project.title }).waitFor({
    state: "visible",
    timeout: 20_000,
  })
  const contextText = (await page.locator(".map-project-context").textContent())?.trim() ?? ""
  if (!contextText.includes(project.title) || !contextText.includes("分集剧情")) {
    throw new Error(`Canvas context incomplete: ${contextText}`)
  }
  await page.screenshot({
    path: path.join(outputDir, "canvas-from-skill-desktop.png"),
    fullPage: false,
  })

  await page.getByRole("button", { name: /返回工作台/ }).click()
  await page.locator(".map-overlay").waitFor({ state: "hidden", timeout: 10_000 })
  if (new URL(page.url()).searchParams.has("view")) {
    throw new Error(`Returning to workbench kept canvas view: ${page.url()}`)
  }
  if (stepOf(page.url()) !== "episodes") throw new Error(`Returning lost step: ${page.url()}`)

  await page.getByRole("button", { name: "打开项目画布" }).first().click()
  await page.waitForURL(/view=canvas/, { timeout: 10_000 })
  await page.locator(".map-overlay").waitFor({ state: "visible", timeout: 10_000 })
  await page.goBack({ waitUntil: "domcontentloaded" })
  await page.locator(".map-overlay").waitFor({ state: "hidden", timeout: 10_000 })
  if (new URL(page.url()).searchParams.has("view")) throw new Error("Browser back did not close canvas")
  await page.goForward({ waitUntil: "domcontentloaded" })
  await page.locator(".map-overlay").waitFor({ state: "visible", timeout: 10_000 })
  if (!new URL(page.url()).searchParams.has("view")) throw new Error("Browser forward did not reopen canvas")

  const deepLink = `${baseURL}/?project=${encodeURIComponent(project.id)}&step=visuals&view=canvas`
  await page.goto(deepLink, { waitUntil: "networkidle", timeout: 30_000 })
  await page.locator(".map-overlay").waitFor({ state: "visible", timeout: 20_000 })
  await page.locator(".map-project-context strong").filter({ hasText: project.title }).waitFor({
    state: "visible",
    timeout: 20_000,
  })
  if (stepOf(page.url()) !== "visuals") throw new Error(`Canvas deep link lost step: ${page.url()}`)

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(deepLink, { waitUntil: "networkidle", timeout: 30_000 })
  await mobilePage.locator(".map-overlay").waitFor({ state: "visible", timeout: 20_000 })
  const mobileOverflow = await mobilePage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (mobileOverflow.scrollWidth > mobileOverflow.width + 2) {
    throw new Error(`mobile overflow ${JSON.stringify(mobileOverflow)}`)
  }
  const mobileContextText = (await mobilePage.locator(".map-project-context").textContent())?.trim() ?? ""
  if (!mobileContextText.includes(project.title) || !mobileContextText.includes("定妆")) {
    throw new Error(`Mobile canvas context incomplete: ${mobileContextText}`)
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, "canvas-context-mobile.png"),
    fullPage: false,
  })

  if (errors.length > 0) throw new Error(`console errors: ${errors.join(" | ")}`)
  console.log(JSON.stringify({
    projectId: project.id,
    skillURL: skillsURL.toString(),
    contextText,
    mobileContextText,
    mobileOverflow,
    screenshots: outputDir,
  }, null, 2))
} finally {
  await browser.close()
}
