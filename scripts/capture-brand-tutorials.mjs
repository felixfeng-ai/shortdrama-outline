import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { chromium } from "playwright-core"

const repoRoot = path.resolve(import.meta.dirname, "..")
const port = process.env.VISUAL_QA_PORT ? Number(process.env.VISUAL_QA_PORT) : 3291
const baseURL = process.env.VISUAL_QA_URL || `http://localhost:${port}`
const tutorialDir = path.join(repoRoot, "public", "docs", "tutorial")
const SAMPLE_NOVEL_TEXT = [
  "雨在凌晨两点以后变得密了。旧报社的玻璃门被风吹得响了一下，又慢慢退回去，像有人站在外面犹豫。",
  "林远把伞收在门边，水顺着伞骨滴到地砖上。他没有开顶灯，只借着走廊尽头那盏值班灯，把牛皮纸袋放在前台。纸袋没有寄件人的名字。",
  "手机在这时震动。屏幕上只有一条陌生号码发来的短信：\n\n「你已经看见那一页了。」",
].join("\n\n")
let server = null

async function canReach(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) })
    return response.ok
  } catch {
    return false
  }
}

async function ensureServer() {
  if (await canReach(baseURL)) return
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
  server = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  let stderr = ""
  server.stderr.on("data", (chunk) => { stderr += chunk.toString() })
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await canReach(baseURL)) return
    if (server.exitCode !== null) throw new Error(`开发服务启动失败：${stderr}`)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`开发服务启动超时：${stderr}`)
}

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

async function settle(page, selector) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(700)
}

async function settleProject(page, projectTitle) {
  await settle(page, ".wfx-workspace")
  await page.waitForFunction(
    (title) => document.body.innerText.includes(title),
    projectTitle,
    { timeout: 20_000 },
  )
  await page.waitForTimeout(700)
}

async function shot(page, file, top = true) {
  if (top) {
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }))
  }
  await page.screenshot({
    path: path.join(tutorialDir, file),
    fullPage: false,
    animations: "disabled",
  })
}

try {
  await ensureServer()
  const browser = await chromium.launch({
    executablePath: fs.existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  })

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    })
    const page = await context.newPage()
    await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
    const project = await createSampleProject(page)
    const projectID = encodeURIComponent(project.id)

    await page.goto(`${baseURL}/?project=${projectID}`, { waitUntil: "domcontentloaded", timeout: 30_000 })
    await settleProject(page, project.title)
    await shot(page, "01-quick-start.png")
    await page.getByRole("button", { name: "查看详情" }).click()
    await settle(page, ".release-dialog")
    await shot(page, "10-release-notes.png")
    await page.getByRole("button", { name: "关闭公告详情" }).click()
    await page.locator(".release-dialog").waitFor({ state: "detached", timeout: 5_000 })
    fs.copyFileSync(path.join(tutorialDir, "01-quick-start.png"), path.join(tutorialDir, "05-export.png"))

    await page.goto(`${baseURL}/?project=${projectID}&step=visuals`, { waitUntil: "domcontentloaded", timeout: 30_000 })
    await settleProject(page, project.title)
    await shot(page, "02-visual-assets.png")

    await page.goto(`${baseURL}/?project=${projectID}&step=shots`, { waitUntil: "domcontentloaded", timeout: 30_000 })
    await settleProject(page, project.title)
    await page.locator("#shot-workspace-video").click()
    await page.locator("#shot-workspace-tabs").evaluate((node) => node.scrollIntoView({ block: "start" }))
    await page.waitForTimeout(700)
    await shot(page, "03-shot-video.png", false)
    await page.locator("#shot-workspace-tabs button").filter({ hasText: "时间线成片" }).click()
    await page.locator("#shot-workspace-tabs").evaluate((node) => node.scrollIntoView({ block: "start" }))
    await page.waitForFunction(
      () => !document.body.innerText.includes("正在读取时间线"),
      { timeout: 20_000 },
    ).catch(() => {})
    await page.waitForTimeout(900)
    await shot(page, "04-timeline.png", false)

    await page.goto(`${baseURL}/?project=${projectID}&view=create`, { waitUntil: "domcontentloaded", timeout: 30_000 })
    await settle(page, ".skill-page-embedded")
    await page.waitForFunction(
      (title) => document.body.innerText.includes(title),
      project.title,
      { timeout: 20_000 },
    )
    await page.locator(".skill-recommendations-grid > button").first().waitFor({
      state: "visible",
      timeout: 20_000,
    })
    const preflight = page.locator(".intake-preflight")
    if (await preflight.getAttribute("open") !== null) {
      throw new Error("创作模式截图中的执行准备应默认折叠")
    }
    await shot(page, "06-workspace-create.png")

    await page.goto(`${baseURL}/?project=${projectID}`, { waitUntil: "domcontentloaded", timeout: 30_000 })
    await settleProject(page, project.title)
    await page.getByRole("button", { name: "下载手机 App" }).click()
    await settle(page, "[role=dialog]")
    await shot(page, "08-mobile-app.png")

    const novelProject = await page.evaluate(async (currentProjectId) => {
      const projectsResponse = await fetch("/api/projects")
      const projectsPayload = await projectsResponse.json()
      const projects = Array.isArray(projectsPayload.data)
        ? projectsPayload.data
        : projectsPayload.data?.projects ?? []
      for (const item of [currentProjectId, ...projects.map((entry) => entry.id)]) {
        const response = await fetch(`/api/projects/${encodeURIComponent(item)}/novels`)
        const payload = await response.json()
        const editions = payload.data?.editions ?? []
        if (editions.some((edition) => Number(edition.completedChapters) > 0)) {
          return { projectId: item, editions }
        }
      }
      return { projectId: currentProjectId, editions: [] }
    }, project.id)
    let novelEdition = novelProject.editions[0] ?? null
    if (!novelEdition) {
      novelEdition = await page.evaluate(async ({ id, title }) => {
        const response = await fetch(`/api/projects/${encodeURIComponent(id)}/novels`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ preset: "medium", title }),
        })
        const payload = await response.json()
        if (!response.ok || !payload.success) throw new Error(payload.error || "novel creation failed")
        return payload.data.edition
      }, { id: novelProject.projectId, title: project.title })
    }
    const planned = await page.evaluate(async ({ projectId, novelId }) => {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || "novel plan failed")
      return payload.data
    }, { projectId: novelProject.projectId, novelId: novelEdition.id })
    if (planned.chapters?.[0]?.id) {
      await page.evaluate(async ({ projectId, novelId, chapterId, content }) => {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content }),
          },
        )
        const payload = await response.json()
        if (!response.ok || !payload.success) throw new Error(payload.error || "novel chapter edit failed")
      }, {
        projectId: novelProject.projectId,
        novelId: novelEdition.id,
        chapterId: planned.chapters[0].id,
        content: SAMPLE_NOVEL_TEXT,
      })
    }
    await page.goto(
      `${baseURL}/novels/${encodeURIComponent(novelProject.projectId)}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    )
    await settle(page, ".novel-topbar, .novel-setup-top")
    await page.waitForTimeout(1600)
    await shot(page, "09-novel-workspace.png")

    const preview = await context.newPage()
    await preview.goto(`${baseURL}/docs`, { waitUntil: "domcontentloaded", timeout: 30_000 })
    await settle(preview, ".docs-hero h1")
    const brokenImages = await preview.locator(".docs-article img").evaluateAll((images) =>
      images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute("src")),
    )
    if (brokenImages.length > 0) throw new Error(`教程图片加载失败：${brokenImages.join(", ")}`)
    await context.close()

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    })
    const mobile = await mobileContext.newPage()
    const mobileChecks = []
    for (const [name, url, selector] of [
      ["workspace", `${baseURL}/?project=${projectID}`, ".wfx-mobile-brand"],
      ["login", `${baseURL}/login`, ".auth-brand"],
      ["docs", `${baseURL}/docs`, ".docs-brand"],
    ]) {
      await mobile.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
      await settle(mobile, selector)
      const result = await mobile.evaluate(() => ({
        title: document.title,
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      if (result.scrollWidth > result.width + 2) {
        throw new Error(`${name} 移动端横向溢出：${JSON.stringify(result)}`)
      }
      if (!result.title.includes("VeyaTV")) {
        throw new Error(`${name} 页面标题未包含 VeyaTV：${result.title}`)
      }
      const screenshot = path.join(os.tmpdir(), `veyatv-brand-${name}-390.png`)
      await mobile.screenshot({ path: screenshot, fullPage: false, animations: "disabled" })
      mobileChecks.push({ name, ...result, screenshot })
    }
    await mobileContext.close()
    console.log(JSON.stringify({ mobileChecks }, null, 2))
  } finally {
    await browser.close()
  }

  console.log(JSON.stringify({ baseURL, tutorialDir }, null, 2))
} finally {
  if (server) {
    server.kill()
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000)
      server.once("exit", () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
