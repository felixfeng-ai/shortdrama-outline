import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3216"
const outputDir = path.resolve(".tmp-visual-qa", "skill-plan")
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

async function openFirstPlan(page) {
  const recommendations = page.locator(".skill-recommendations-grid > button")
  await recommendations.first().waitFor({ state: "visible", timeout: 20_000 })
  const count = await recommendations.count()
  if (count !== 3) throw new Error(`expected 3 recommendations, got ${count}`)
  await recommendations.first().click()
  await page.locator(".execution-plan").waitFor({ state: "visible", timeout: 10_000 })
  await page.locator(".execution-plan").scrollIntoViewIfNeeded()
}

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const desktopPage = await desktopContext.newPage()
  const errors = []
  let agentRequests = 0
  const writeRequests = []
  desktopPage.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  desktopPage.on("request", (request) => {
    const writesProject = request.url().includes("/api/projects/")
      || request.url().includes("/api/snapshots")
      || request.url().includes("/api/generation")
    if (writesProject && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      writeRequests.push(`${request.method()} ${request.url()}`)
    }
  })
  await desktopContext.route("**/api/agent", async (route) => {
    agentRequests += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          reply: "已读取当前项目。连续性检查会先输出只读报告，不会直接修改分镜。",
          degraded: false,
        },
        error: null,
      }),
    })
  })

  await desktopPage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  const sample = await createSampleProject(desktopPage)
  await desktopPage.goto(
    `${baseURL}/skills?project=${encodeURIComponent(sample.id)}&mode=project`,
    { waitUntil: "networkidle", timeout: 30_000 },
  )
  await desktopPage.screenshot({
    path: path.join(outputDir, "skill-recommendations-desktop.png"),
    fullPage: false,
  })
  await openFirstPlan(desktopPage)

  const stepCount = await desktopPage.locator(".execution-plan-steps li").count()
  if (stepCount < 3) throw new Error(`plan has too few steps: ${stepCount}`)
  const labels = await desktopPage.locator(".execution-plan-metrics small").allTextContents()
  if (!["额度上限", "预计耗时", "写入边界"].every((label) => labels.includes(label))) {
    throw new Error(`missing plan metrics: ${JSON.stringify(labels)}`)
  }
  const desktopOverflow = await desktopPage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (desktopOverflow.scrollWidth > desktopOverflow.width + 2) {
    throw new Error(`desktop overflow ${JSON.stringify(desktopOverflow)}`)
  }
  await desktopPage.screenshot({
    path: path.join(outputDir, "skill-plan-desktop.png"),
    fullPage: false,
  })

  await desktopPage.locator(".execution-plan-primary").click()
  await desktopPage.locator(".agent-drawer.open").waitFor({ state: "visible", timeout: 10_000 })
  await desktopPage.locator(".continuity-report, .deterministic-report").first().waitFor({
    state: "visible",
    timeout: 10_000,
  })
  if (writeRequests.length > 0) throw new Error(`plan wrote before confirmation: ${writeRequests.join(" | ")}`)
  const primaryText = (await desktopPage.locator(".execution-plan-primary").textContent())?.trim()
  if (!primaryText?.startsWith("Agent 已打开")) {
    throw new Error(`unexpected primary state: ${primaryText}`)
  }

  await desktopPage.getByRole("button", { name: "关闭 Agent" }).click()
  await desktopPage.locator('.skill-card').filter({ hasText: "故事医生" }).click()
  await desktopPage.locator('#skill-execution-plan[data-skill="story-doctor"]').waitFor({
    state: "visible",
    timeout: 10_000,
  })
  if (await desktopPage.locator(".execution-plan-primary").isDisabled()) {
    throw new Error("story doctor should be available for the sample project")
  }
  await desktopPage.locator(".execution-plan-primary").click()
  await desktopPage.locator(".agent-drawer.open").waitFor({ state: "visible", timeout: 10_000 })
  await desktopPage.waitForFunction(
    () => document.querySelectorAll(".agent-messages .assistant-message").length > 0,
    null,
    { timeout: 10_000 },
  )
  if (agentRequests < 1) throw new Error("Agent did not receive the confirmed model Skill")
  await desktopPage.getByRole("button", { name: "关闭 Agent" }).click()

  await desktopPage.locator('.skill-card').filter({ hasText: "小说 / 剧本改编" }).click()
  await desktopPage.locator('#skill-execution-plan[data-skill="adaptation"]').waitFor({
    state: "visible",
    timeout: 10_000,
  })
  const adaptationBlocked = await desktopPage.locator(".execution-plan-primary").isDisabled()
  if (!adaptationBlocked) throw new Error("adaptation should be blocked without source material")

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(
    `${baseURL}/skills?project=${encodeURIComponent(sample.id)}&mode=project`,
    { waitUntil: "networkidle", timeout: 30_000 },
  )
  await mobilePage.screenshot({
    path: path.join(outputDir, "skill-recommendations-mobile.png"),
    fullPage: false,
  })
  await openFirstPlan(mobilePage)
  await mobilePage.locator(".execution-plan").scrollIntoViewIfNeeded()
  const mobileOverflow = await mobilePage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (mobileOverflow.scrollWidth > mobileOverflow.width + 2) {
    throw new Error(`mobile overflow ${JSON.stringify(mobileOverflow)}`)
  }
  const primaryBox = await mobilePage.locator(".execution-plan-primary").boundingBox()
  if (!primaryBox || primaryBox.height < 44) {
    throw new Error(`mobile primary action below 44px: ${JSON.stringify(primaryBox)}`)
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, "skill-plan-mobile.png"),
    fullPage: false,
  })

  if (errors.length > 0) throw new Error(`console errors: ${errors.join(" | ")}`)

  console.log(JSON.stringify({
    projectId: sample.id,
    stepCount,
    labels,
    desktopOverflow,
    mobileOverflow,
    adaptationBlocked,
    agentRequests,
    writeRequests,
    screenshots: outputDir,
  }, null, 2))
} finally {
  await browser.close()
}
