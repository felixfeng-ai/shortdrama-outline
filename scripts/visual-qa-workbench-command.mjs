import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3216"
const outputDir = path.resolve(".tmp-visual-qa", "workbench-command")
fs.mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
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

async function createBlankProject(page, title) {
  return page.evaluate(async (projectTitle) => {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: projectTitle }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || "project failed")
    return payload.data.project
  }, title)
}

async function commandMetrics(page, label) {
  const command = page.locator(".signal-command")
  const idea = page.locator(".idea-workbench")
  await command.waitFor({ state: "visible", timeout: 20_000 })
  const [commandBox, ideaBox] = await Promise.all([
    command.boundingBox(),
    idea.boundingBox(),
  ])
  if (!commandBox || !ideaBox) throw new Error(`${label}: command or story input is not measurable`)
  if (commandBox.y + commandBox.height > ideaBox.y + 1) {
    throw new Error(`${label}: command overlaps or follows the story input`)
  }
  const labels = await page.locator(".signal-command-label").allTextContents()
  if (!["当前任务", "阻塞", "下一步"].every((text) => labels.includes(text))) {
    throw new Error(`${label}: missing command labels ${JSON.stringify(labels)}`)
  }
  return { commandBox, ideaBox }
}

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const desktopPage = await desktopContext.newPage()
  await desktopPage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  const project = await createSampleProject(desktopPage)
  const projectURL = `${baseURL}/?project=${encodeURIComponent(project.id)}&step=characters`
  await desktopPage.goto(projectURL, { waitUntil: "networkidle", timeout: 30_000 })
  const desktop = await commandMetrics(desktopPage, "desktop")
  await desktopPage.screenshot({
    path: path.join(outputDir, "workbench-command-desktop.png"),
    fullPage: false,
  })
  const primaryAction = desktopPage.locator(".signal-command-action").first()
  const primaryStep = await primaryAction.getAttribute("data-step")
  if (primaryStep) {
    await primaryAction.click()
    await desktopPage.waitForFunction(
      (step) => new URL(window.location.href).searchParams.get("step") === step,
      primaryStep,
      { timeout: 5_000 },
    )
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(projectURL, { waitUntil: "networkidle", timeout: 30_000 })
  const mobile = await commandMetrics(mobilePage, "mobile")
  const overflow = await mobilePage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (overflow.scrollWidth > overflow.width + 2) {
    throw new Error(`mobile overflow ${JSON.stringify(overflow)}`)
  }
  const actionHeights = await mobilePage.locator(".signal-command-action").evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  )
  if (actionHeights.some((height) => height < 44)) {
    throw new Error(`mobile actions below 44px: ${JSON.stringify(actionHeights)}`)
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, "workbench-command-mobile.png"),
    fullPage: false,
  })

  const emptyContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const emptyPage = await emptyContext.newPage()
  await emptyPage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  const emptyProject = await createBlankProject(emptyPage, "空工作台验收")
  await emptyPage.goto(
    `${baseURL}/?project=${encodeURIComponent(emptyProject.id)}&step=characters`,
    { waitUntil: "networkidle", timeout: 30_000 },
  )
  const [emptyIdeaBox, emptyCommandBox] = await Promise.all([
    emptyPage.locator(".idea-workbench").boundingBox(),
    emptyPage.locator(".signal-command").boundingBox(),
  ])
  if (!emptyIdeaBox || !emptyCommandBox) throw new Error("empty: story or command is not measurable")
  if (emptyIdeaBox.y + emptyIdeaBox.height > emptyCommandBox.y + 1) {
    throw new Error("empty: command displaced the first-run story input")
  }
  const emptyDetail = await emptyPage.locator(".signal-command-detail").first().textContent()
  if (emptyDetail?.trim() !== "等待故事想法") {
    throw new Error(`empty: unexpected current task ${JSON.stringify(emptyDetail)}`)
  }
  await emptyPage.screenshot({
    path: path.join(outputDir, "workbench-command-empty-mobile.png"),
    fullPage: false,
  })

  console.log(JSON.stringify({
    projectId: project.id,
    desktop,
    mobile,
    overflow,
    actionHeights,
    primaryStep,
    emptyProjectId: emptyProject.id,
    screenshots: outputDir,
  }, null, 2))
} finally {
  await browser.close()
}
