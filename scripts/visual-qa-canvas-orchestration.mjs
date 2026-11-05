import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3216"
const outputDir = path.resolve(".tmp-visual-qa", "canvas-orchestration")
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

async function openGraph(page) {
  if (!(await page.locator(".map-bar").isVisible().catch(() => false))) {
    const trigger = page.getByRole("button", { name: "打开项目画布" }).first()
    await trigger.waitFor({ state: "visible", timeout: 20_000 })
    await trigger.click()
  }
  await page.getByRole("tab", { name: /编排画布/ }).click()
  await page.locator(".canvas-graph-workspace").waitFor({ state: "visible", timeout: 15_000 })
}

async function graphRecord(page, projectId) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}/canvas-graph`)
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || "canvas graph read failed")
    return payload.data
  }, projectId)
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
  const url = `${baseURL}/?project=${encodeURIComponent(project.id)}&step=shots`
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
  await openGraph(page)
  await page.waitForFunction(() => {
    const status = document.querySelector(".canvas-graph-save")?.textContent || ""
    return status.includes("已保存")
  }, undefined, { timeout: 15_000 })

  const nodes = page.locator(".canvas-graph-node")
  if (await nodes.count() !== 7) throw new Error("default graph node count is incorrect")
  await page.screenshot({
    path: path.join(outputDir, "canvas-graph-default-desktop.png"),
    fullPage: false,
  })

  await page.getByRole("button", { name: "备注", exact: true }).click()
  const note = page.locator(".canvas-graph-node.note")
  await note.waitFor({ state: "visible", timeout: 5_000 })
  await page.getByLabel("标题").fill("雨夜钩子")
  await page.getByLabel("内容").fill("片头先给便利店最后一盏灯，再切主角回头。")
  await page.getByRole("button", { name: "连接节点" }).click()
  await page.getByRole("button", { name: /三幕大纲/ }).click()
  await page.waitForFunction(() => {
    const status = document.querySelector(".canvas-graph-save")?.textContent || ""
    return status.includes("已保存")
  }, undefined, { timeout: 15_000 })

  const firstRecord = await graphRecord(page, project.id)
  if (!firstRecord?.graph?.nodes.some((node) => node.id && node.type === "note" && node.title === "雨夜钩子")) {
    throw new Error("note node was not persisted")
  }
  if (!firstRecord.graph.edges.some((edge) =>
    firstRecord.graph.nodes.find((node) => node.id === edge.from)?.type === "note"
  )) {
    throw new Error("note connection was not persisted")
  }

  const box = await note.boundingBox()
  if (!box) throw new Error("note node has no bounding box")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 40, { steps: 5 })
  await page.mouse.up()
  await page.waitForFunction(() => {
    const status = document.querySelector(".canvas-graph-save")?.textContent || ""
    return status.includes("已保存")
  }, undefined, { timeout: 15_000 })
  const movedRecord = await graphRecord(page, project.id)
  const initialNote = firstRecord.graph.nodes.find((node) => node.type === "note")
  const movedNote = movedRecord?.graph?.nodes.find((node) => node.type === "note")
  if (!initialNote || !movedNote || movedNote.x <= initialNote.x || movedNote.y <= initialNote.y) {
    throw new Error("node drag position was not persisted")
  }
  await page.screenshot({
    path: path.join(outputDir, "canvas-graph-edited-desktop.png"),
    fullPage: false,
  })

  await page.reload({ waitUntil: "networkidle", timeout: 30_000 })
  await openGraph(page)
  await page.getByText("雨夜钩子", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })

  const secondPage = await context.newPage()
  const secondErrors = []
  secondPage.on("console", (message) => {
    if (message.type() === "error") secondErrors.push(message.text())
  })
  secondPage.on("pageerror", (error) => secondErrors.push(`PAGEERROR: ${error.message}`))
  await secondPage.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
  await openGraph(secondPage)
  await secondPage.getByText("雨夜钩子", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
  await secondPage.getByText(/实时同步 · 2 个标签页/).waitFor({ state: "visible", timeout: 12_000 })

  await page.locator(".canvas-graph-node.note").click()
  await page.getByLabel("标题").fill("跨标签页实时节点")
  await secondPage.getByText("跨标签页实时节点", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
  await page.waitForFunction(() => {
    const status = document.querySelector(".canvas-graph-save")?.textContent || ""
    return status.includes("已保存")
  }, undefined, { timeout: 15_000 })

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobileContext.newPage()
  const mobileErrors = []
  mobilePage.on("console", (message) => {
    if (message.type() === "error") mobileErrors.push(message.text())
  })
  mobilePage.on("pageerror", (error) => mobileErrors.push(`PAGEERROR: ${error.message}`))
  await mobilePage.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
  await openGraph(mobilePage)
  await mobilePage.getByText("跨标签页实时节点", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
  const overflow = await mobilePage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (overflow.scrollWidth > overflow.width + 2) {
    throw new Error(`mobile overflow ${JSON.stringify(overflow)}`)
  }
  const mobilePalette = await mobilePage.getByRole("button", { name: "备注", exact: true }).boundingBox()
  if (!mobilePalette || mobilePalette.height < 44) {
    throw new Error(`mobile palette target below 44px: ${JSON.stringify(mobilePalette)}`)
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, "canvas-graph-mobile.png"),
    fullPage: false,
  })

  if (errors.length > 0) throw new Error(`console errors: ${errors.join(" | ")}`)
  if (secondErrors.length > 0) throw new Error(`second page errors: ${secondErrors.join(" | ")}`)
  if (mobileErrors.length > 0) throw new Error(`mobile errors: ${mobileErrors.join(" | ")}`)

  console.log(JSON.stringify({
    projectId: project.id,
    revision: firstRecord.revision,
    nodeCount: firstRecord.graph.nodes.length,
    edgeCount: firstRecord.graph.edges.length,
    overflow,
    mobilePalette,
    screenshots: outputDir,
  }, null, 2))
} finally {
  await browser.close()
}
