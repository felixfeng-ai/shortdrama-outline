import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3216"
const outputDir = path.resolve(".tmp-visual-qa", "artifact-center")
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

async function addCharacterVersion(page, projectId) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/snapshots?projectId=${encodeURIComponent(id)}&kind=characters`)
    const payload = await response.json()
    const latest = payload.data?.snapshots?.[0]
    if (!latest) throw new Error("sample characters snapshot missing")
    const next = latest.payload.map((item, index) => index === 0
      ? {
        ...item,
        motivation: `${item.motivation ?? ""}（用于版本对比验收）`,
      }
      : item)
    const saved = await fetch("/api/snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: id, kind: "characters", payload: next }),
    })
    const result = await saved.json()
    if (!saved.ok || !result.success) throw new Error(result.error || "snapshot save failed")
    return result.data.snapshot
  }, projectId)
}

async function firstShotId(page, projectId) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/snapshots?projectId=${encodeURIComponent(id)}&kind=shots`)
    const payload = await response.json()
    const shot = payload.data?.snapshots?.[0]?.payload?.[0]
    if (!shot?.id) throw new Error("sample shot target missing")
    return shot.entityId || shot.id
  }, projectId)
}

async function latestShotPayload(page, projectId) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/snapshots?projectId=${encodeURIComponent(id)}&kind=shots`)
    const payload = await response.json()
    const latest = payload.data?.snapshots?.[0]
    if (!latest) throw new Error("sample shots snapshot missing")
    return latest.payload
  }, projectId)
}

async function mockAgentProposal(page, targetShotId) {
  let calls = 0
  await page.route("**/api/agent", async (route) => {
    calls += 1
    const body = route.request().postDataJSON()
    const messages = Array.isArray(body?.messages) ? body.messages : []
    const latest = messages[messages.length - 1]
    const data = latest?.role === "tool"
      ? { reply: "建议已生成，请确认。", toolCalls: [], degraded: false }
      : {
        reply: "",
        toolCalls: [{
          id: `visual-qa-shot-edit-${calls}`,
          name: "propose_shot_edit",
          args: {
            targetId: targetShotId,
            target: "action",
            newText: "他停在雨里，回头看向便利店最后一盏灯。",
            summary: "补一个明确的回头动作",
          },
        }],
        degraded: false,
      }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data, error: null }),
    })
  })
  return () => calls
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
  const newVersion = await addCharacterVersion(page, project.id)
  const shotId = await firstShotId(page, project.id)
  const initialShots = await latestShotPayload(page, project.id)
  const agentCalls = await mockAgentProposal(page, shotId)
  const url = `${baseURL}/?project=${encodeURIComponent(project.id)}&step=characters`
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })

  const trigger = page.getByRole("button", { name: "打开产物中心" })
  await trigger.waitFor({ state: "visible", timeout: 20_000 })
  if (await page.locator(".artifact-center-dialog").count() !== 0) {
    throw new Error("artifact center mounted before opening")
  }
  await page.locator(".project-ledger").screenshot({
    path: path.join(outputDir, "artifact-trigger-desktop.png"),
  })
  await trigger.click()

  const dialog = page.locator(".artifact-center-dialog")
  await dialog.waitFor({ state: "visible", timeout: 10_000 })
  const kindRows = page.locator(".artifact-kind-row")
  if (await kindRows.count() !== 8) throw new Error("artifact catalog is incomplete")

  await page.getByRole("button", { name: /^人物 / }).click()
  const historyRows = page.locator(".artifact-history-list button")
  await historyRows.first().waitFor({ state: "visible", timeout: 10_000 })
  const historyCount = await historyRows.count()
  if (historyCount < 2) throw new Error("character version history is incomplete")
  if (!newVersion?.id) throw new Error("new character snapshot id missing")
  await page.locator(".artifact-diff-row").first().waitFor({ state: "visible", timeout: 10_000 })
  await page.screenshot({
    path: path.join(outputDir, "artifact-center-version-desktop.png"),
    fullPage: false,
  })

  await page.getByRole("tab", { name: "确认队列" }).click()
  await page.getByText("当前会话没有待处理提案").waitFor({ state: "visible", timeout: 5_000 })
  await page.screenshot({
    path: path.join(outputDir, "artifact-center-queue-desktop.png"),
    fullPage: false,
  })
  await page.keyboard.press("Escape")
  await dialog.waitFor({ state: "detached", timeout: 5_000 })

  await page.getByLabel("向 Veya Agent 提问").fill("帮我把第一镜的动作改得更明确")
  await page.getByRole("button", { name: "发送" }).click()
  const pendingCard = page.locator(".prop").first()
  await pendingCard.waitFor({ state: "visible", timeout: 15_000 })
  if (agentCalls() < 2) throw new Error("agent proposal did not complete its ReAct loop")
  await page.locator(".agent-plan-brief").waitFor({ state: "visible", timeout: 5_000 })
  await page.screenshot({
    path: path.join(outputDir, "agent-action-plan-desktop.png"),
    fullPage: false,
  })

  await trigger.click()
  await page.getByRole("tab", { name: /确认队列/ }).click()
  const queueItems = page.locator(".artifact-queue-list > li")
  await queueItems.first().waitFor({ state: "visible", timeout: 10_000 })
  if (await queueItems.count() !== 1) throw new Error("pending Agent card did not enter the queue")
  await page.screenshot({
    path: path.join(outputDir, "artifact-center-queue-pending-desktop.png"),
    fullPage: false,
  })
  await page.getByRole("button", { name: "在 Agent 中处理" }).click()
  await dialog.waitFor({ state: "detached", timeout: 5_000 })
  await page.getByRole("button", { name: "执行计划" }).click()
  await pendingCard.waitFor({ state: "detached", timeout: 5_000 })

  const runToggle = page.locator(".agent-run-toggle")
  await runToggle.waitFor({ state: "visible", timeout: 10_000 })
  await runToggle.click()
  const runRows = page.locator(".agent-run-row")
  await runRows.first().waitFor({ state: "visible", timeout: 10_000 })
  if (await runRows.count() !== 1) throw new Error("Agent action run was not recorded")
  await page.screenshot({
    path: path.join(outputDir, "agent-run-applied-desktop.png"),
    fullPage: false,
  })
  const appliedRuns = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}/agent-runs`)
    return (await response.json()).data.runs
  }, project.id)
  if (appliedRuns[0]?.status !== "applied") throw new Error("run did not reach applied state")

  await page.getByRole("button", { name: "回滚", exact: true }).click()
  await page.getByRole("button", { name: "确认回滚" }).click()
  await page.getByText("已回滚", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
  const rolledRuns = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}/agent-runs`)
    return (await response.json()).data.runs
  }, project.id)
  if (rolledRuns[0]?.status !== "rolled_back") throw new Error("run did not reach rolled_back state")
  const restoredShots = await latestShotPayload(page, project.id)
  if (JSON.stringify(restoredShots) !== JSON.stringify(initialShots)) {
    throw new Error("rollback snapshot does not match the pre-action payload")
  }
  await page.screenshot({
    path: path.join(outputDir, "agent-run-rolled-back-desktop.png"),
    fullPage: false,
  })

  await trigger.click()
  await page.getByRole("tab", { name: /确认队列/ }).click()
  await page.getByText("当前会话没有待处理提案").waitFor({ state: "visible", timeout: 5_000 })
  await page.getByRole("button", { name: "关闭产物中心" }).click()
  await dialog.waitFor({ state: "detached", timeout: 5_000 })

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobileContext.newPage()
  const mobileErrors = []
  mobilePage.on("console", (message) => {
    if (message.type() === "error") mobileErrors.push(message.text())
  })
  mobilePage.on("pageerror", (error) => mobileErrors.push(`PAGEERROR: ${error.message}`))
  const mobileAgentCalls = await mockAgentProposal(mobilePage, shotId)
  await mobilePage.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
  await mobilePage.getByRole("button", { name: "打开产物中心" }).click()
  await mobilePage.locator(".artifact-center-dialog").waitFor({ state: "visible", timeout: 10_000 })
  await mobilePage.getByRole("button", { name: /^人物 / }).click()
  await mobilePage.locator(".artifact-diff-row").first().waitFor({ state: "visible", timeout: 10_000 })

  const overflow = await mobilePage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (overflow.scrollWidth > overflow.width + 2) {
    throw new Error(`mobile overflow ${JSON.stringify(overflow)}`)
  }
  const closeBox = await mobilePage.getByRole("button", { name: "关闭产物中心" }).boundingBox()
  if (!closeBox || closeBox.width < 44 || closeBox.height < 44) {
    throw new Error(`mobile close target below 44px: ${JSON.stringify(closeBox)}`)
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, "artifact-center-mobile.png"),
    fullPage: false,
  })
  await mobilePage.getByRole("button", { name: "关闭产物中心" }).click()
  await mobilePage.locator(".artifact-center-dialog").waitFor({ state: "detached", timeout: 5_000 })
  await mobilePage.locator(".h-deck-grab").click()
  const mobileRunToggle = mobilePage.locator(".agent-run-toggle")
  await mobileRunToggle.waitFor({ state: "visible", timeout: 10_000 })
  await mobileRunToggle.click()
  await mobilePage.locator(".agent-run-row.rolled_back").waitFor({ state: "visible", timeout: 10_000 })
  await mobilePage.screenshot({
    path: path.join(outputDir, "agent-run-mobile.png"),
    fullPage: false,
  })

  await mobilePage.getByLabel("向 Veya Agent 提问").fill("再给我一版回头动作")
  await mobilePage.getByRole("button", { name: "发送" }).click()
  await mobilePage.locator(".agent-plan-brief").waitFor({ state: "visible", timeout: 15_000 })
  if (mobileAgentCalls() < 2) throw new Error("mobile Agent proposal did not complete")
  const mobileAgentOverflow = await mobilePage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (mobileAgentOverflow.scrollWidth > mobileAgentOverflow.width + 2) {
    throw new Error(`mobile Agent overflow ${JSON.stringify(mobileAgentOverflow)}`)
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, "agent-plan-mobile.png"),
    fullPage: false,
  })

  if (errors.length > 0) throw new Error(`console errors: ${errors.join(" | ")}`)
  if (mobileErrors.length > 0) throw new Error(`mobile console errors: ${mobileErrors.join(" | ")}`)

  console.log(JSON.stringify({
    projectId: project.id,
    newVersionId: newVersion.id,
    historyCount,
    overflow,
    mobileAgentOverflow,
    closeBox,
    screenshots: outputDir,
  }, null, 2))
} finally {
  await browser.close()
}
