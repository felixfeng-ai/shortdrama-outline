import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3200"
const outputDir = path.resolve(".tmp-visual-qa", "agent-session")
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

async function assertSessionBar(page, label) {
  const select = page.locator(".agent-session-select")
  const create = page.locator(".agent-session-new")
  await select.waitFor({ state: "visible", timeout: 20_000 })
  await create.waitFor({ state: "visible", timeout: 10_000 })
  const [selectBox, createBox] = await Promise.all([
    select.boundingBox(),
    create.boundingBox(),
  ])
  if (!selectBox || !createBox) throw new Error(`${label}: session controls not measurable`)
  if (selectBox.x + selectBox.width > createBox.x + 1) {
    throw new Error(`${label}: session controls overlap`)
  }
  if (selectBox.height < 32 || createBox.height < 32) {
    throw new Error(`${label}: session controls too small`)
  }
  return { select: selectBox, create: createBox }
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })

  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  const project = await createSampleProject(page)
  const url = `${baseURL}/?project=${encodeURIComponent(project.id)}&step=episodes`

  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
  const desktop = await assertSessionBar(page, "desktop")
  await page.locator(".h-deck").screenshot({
    path: path.join(outputDir, "desktop-agent-session.png"),
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
  await page.locator(".h-deck-grab").click()
  const mobile = await assertSessionBar(page, "mobile")
  await page.locator(".h-deck").screenshot({
    path: path.join(outputDir, "mobile-agent-session.png"),
  })

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (overflow.scrollWidth > overflow.width + 2) {
    throw new Error(`mobile overflow ${JSON.stringify(overflow)}`)
  }
  if (errors.length > 0) throw new Error(`console errors: ${errors.join(" | ")}`)

  console.log(JSON.stringify({ projectId: project.id, desktop, mobile, overflow }, null, 2))
} finally {
  await browser.close()
}
