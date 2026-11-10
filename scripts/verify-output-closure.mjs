import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "playwright-core"

const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:3317").replace(/\/$/, "")
const projectIdFromEnv = process.env.PROJECT_ID?.trim() || ""
const chromePath = process.env.CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const outputDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".artifacts",
  "production-output-closure",
)
await mkdir(outputDir, { recursive: true })

async function resolveProjectId() {
  if (projectIdFromEnv) return projectIdFromEnv
  const response = await fetch(`${baseUrl}/api/projects`, { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  const project = payload?.data?.projects?.[0]
  if (!project?.id) throw new Error("没有可验收项目，请设置 PROJECT_ID")
  return project.id
}

async function inspect(page, label) {
  await page.waitForTimeout(1_000)
  const facts = await page.evaluate(() => ({
    url: location.href,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyText: (document.querySelector("body")?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800),
  }))
  if (facts.scrollWidth > facts.clientWidth + 1) {
    throw new Error(`${label} 出现横向溢出：${facts.scrollWidth} > ${facts.clientWidth}`)
  }
  return facts
}

async function clickFirstVisible(page, locator) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const states = await locator.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            visible: rect.width > 0 && rect.height > 0,
            disabled: element.hasAttribute("disabled"),
          }
        })
      )
      const index = states.findIndex((state) => state.visible && !state.disabled)
      if (index < 0) return false
      await locator.nth(index).click()
      return true
    } catch (error) {
      if (attempt === 2) throw error
      await page.waitForTimeout(1_500)
    }
  }
  return false
}

async function clickVisibleArtifactTrigger(page, projectId) {
  if (await clickFirstVisible(page, page.locator(".artifact-center-trigger"))) {
    return
  }
  const sidebarEntry = page.getByRole("button", { name: "产物中心", exact: true })
  if (await clickFirstVisible(page, sidebarEntry)) return

  const mobileMenu = page.getByRole("button", { name: "打开工作区菜单" })
  if (await clickFirstVisible(page, mobileMenu)) {
    if (await clickFirstVisible(page, sidebarEntry)) return
  }
  const debug = await page.evaluate(async (targetProjectId) => ({
    buttons: Array.from(document.querySelectorAll("button"))
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 80),
    text: (document.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500),
  }), projectId)
  throw new Error(`找不到可见的产物入口：${JSON.stringify(debug)}`)
}

const projectId = await resolveProjectId()
const browser = await chromium.launch({ executablePath: chromePath, headless: true })
const results = []

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    })
    const target = new URL(baseUrl)
    if (target.hostname === "127.0.0.1" || target.hostname === "localhost") {
      await context.addCookies([{
        name: "chengju_sid",
        value: "anon_local_development_session_0000000000000000",
        domain: target.hostname,
        path: "/",
      }])
    }
    const page = await context.newPage()
    const errors = []
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text())
    })
    page.on("pageerror", (error) => errors.push(error.message))

    await page.goto(
      `${baseUrl}/?project=${encodeURIComponent(projectId)}&step=shots`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    )
    await page.waitForLoadState("networkidle").catch(() => {})
    await page.waitForTimeout(4_000)

    const result = {
      viewport: viewport.name,
      artifactTabs: [],
      artifactFacts: null,
      deliveryFacts: null,
      errors,
    }
    results.push(result)
    try {
      await clickVisibleArtifactTrigger(page, projectId)
      try {
        await page.getByRole("tab", { name: "成品" }).waitFor({ timeout: 8_000 })
      } catch {
        const debug = await page.evaluate(() => ({
          dialogs: document.querySelectorAll('[role="dialog"]').length,
          visibleText: (document.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 800),
        }))
        throw new Error(
          `${viewport.name} 产物页未打开：${JSON.stringify(debug)}；控制台：${errors.join(" | ") || "无"}`,
        )
      }
      await page.waitForTimeout(1_000)
      const dialog = page.getByRole("dialog", { name: "产物中心" })
      const tabs = await dialog.getByRole("tab").allTextContents()
      if (tabs.join("|") !== "成品|创作产物|确认队列") {
        throw new Error(`${viewport.name} 产物页签顺序不正确：${tabs.join("|")}`)
      }
      const nextActionStyle = await dialog.locator(".artifact-output-next a").evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          text: (element.textContent || "").trim(),
          color: style.color,
          background: style.backgroundColor,
        }
      })
      if (!nextActionStyle.text || nextActionStyle.color === nextActionStyle.background) {
        throw new Error(`${viewport.name} 成品下一步按钮文字不可见：${JSON.stringify(nextActionStyle)}`)
      }
      const artifactFacts = await inspect(page, `${viewport.name} 产物中心`)
      await page.screenshot({
        path: path.join(outputDir, `${viewport.name}-outputs.png`),
        fullPage: true,
        animations: "disabled",
      })
      await page.keyboard.press("Escape")
      result.artifactTabs = tabs
      result.artifactFacts = artifactFacts
      result.nextActionStyle = nextActionStyle
    } catch (cause) {
      if (viewport.name === "desktop") {
        throw cause
      }
      result.artifactError = cause instanceof Error ? cause.message : String(cause)
    }

    await page.goto(
      `${baseUrl}/delivery/${encodeURIComponent(projectId)}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    )
    await page.waitForTimeout(1_500)
    const deliveryFacts = await inspect(page, `${viewport.name} 交付中心`)
    await page.screenshot({
      path: path.join(outputDir, `${viewport.name}-delivery.png`),
      fullPage: true,
      animations: "disabled",
    })
    result.deliveryFacts = deliveryFacts
    if (errors.length > 0) {
      throw new Error(`${viewport.name} 出现控制台错误：${errors.join(" | ")}`)
    }
    await context.close()
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify({ projectId, results }, null, 2))
