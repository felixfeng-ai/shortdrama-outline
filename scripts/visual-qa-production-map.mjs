import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3216"
const outputDir = path.resolve(".tmp-visual-qa", "production-map")
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

async function waitForProductionMap(page) {
  await page.locator(".production-map").waitFor({ state: "visible", timeout: 20_000 })
  await page.locator(".production-episode-tabs > button").first().waitFor({
    state: "visible",
    timeout: 20_000,
  })
}

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const desktopPage = await desktopContext.newPage()
  const errors = []
  desktopPage.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  desktopPage.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

  await desktopPage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  const project = await createSampleProject(desktopPage)
  const canvasURL = `${baseURL}/?project=${encodeURIComponent(project.id)}&step=shots&view=canvas`
  await desktopPage.goto(canvasURL, { waitUntil: "networkidle", timeout: 30_000 })
  await waitForProductionMap(desktopPage)

  const tabs = desktopPage.locator(".production-episode-tabs > button")
  const episodeCount = await tabs.count()
  if (episodeCount < 1) throw new Error("production map has no episode tabs")
  const sceneCount = await desktopPage.locator(".production-scene").count()
  const shotCount = await desktopPage.locator(".production-shot").count()
  if (sceneCount < 1 || shotCount < 1) {
    throw new Error(`production map is empty: scenes=${sceneCount}, shots=${shotCount}`)
  }

  let selectedEpisode = (await tabs.first().textContent())?.trim() ?? ""
  if (episodeCount > 1) {
    const before = await desktopPage.locator(".production-episode-head h3").textContent()
    await tabs.nth(1).click()
    await desktopPage.waitForFunction(
      (previous) => document.querySelector(".production-episode-head h3")?.textContent !== previous,
      before,
      { timeout: 5_000 },
    )
    selectedEpisode = (await tabs.nth(1).textContent())?.trim() ?? ""
  }

  await desktopPage.getByRole("tab", { name: /六步流程/ }).click()
  await desktopPage.locator(".map-stage-wrap").waitFor({ state: "visible", timeout: 5_000 })
  await desktopPage.getByRole("tab", { name: /制作地图/ }).click()
  await waitForProductionMap(desktopPage)
  await desktopPage.screenshot({
    path: path.join(outputDir, "production-map-desktop.png"),
    fullPage: false,
  })

  const desktopOverflow = await desktopPage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (desktopOverflow.scrollWidth > desktopOverflow.width + 2) {
    throw new Error(`desktop overflow ${JSON.stringify(desktopOverflow)}`)
  }

  await desktopPage.locator(".production-shot").first().click()
  await desktopPage.waitForFunction(
    () => !new URL(window.location.href).searchParams.has("view")
      && new URL(window.location.href).searchParams.get("step") === "shots",
    null,
    { timeout: 10_000 },
  )
  if (!new URL(desktopPage.url()).searchParams.has("shot")) {
    throw new Error(`shot did not open inspector target: ${desktopPage.url()}`)
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(canvasURL, { waitUntil: "networkidle", timeout: 30_000 })
  await waitForProductionMap(mobilePage)
  const mobileOverflow = await mobilePage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (mobileOverflow.scrollWidth > mobileOverflow.width + 2) {
    throw new Error(`mobile overflow ${JSON.stringify(mobileOverflow)}`)
  }
  const tabHeights = await mobilePage.locator(".production-episode-tabs > button").evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  )
  if (tabHeights.some((height) => height < 44)) {
    throw new Error(`episode tabs below 44px: ${JSON.stringify(tabHeights)}`)
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, "production-map-mobile.png"),
    fullPage: false,
  })

  if (errors.length > 0) throw new Error(`console errors: ${errors.join(" | ")}`)
  console.log(JSON.stringify({
    projectId: project.id,
    episodeCount,
    sceneCount,
    shotCount,
    selectedEpisode,
    desktopOverflow,
    mobileOverflow,
    tabHeights,
    screenshots: outputDir,
  }, null, 2))
} finally {
  await browser.close()
}
