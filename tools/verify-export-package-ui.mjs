import { chromium } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

import { readStoreZip } from "../lib/archive/zip.ts"

function findChrome() {
  const candidates = [
    process.env.LOCALAPPDATA + "\\ms-playwright",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && candidate.endsWith(".exe")) return candidate
    if (!fs.existsSync(candidate)) continue
    for (const dir of fs.readdirSync(candidate).filter((name) => name.startsWith("chromium"))) {
      const executable = path.join(candidate, dir, "chrome-win", "chrome.exe")
      if (fs.existsSync(executable)) return executable
    }
  }
  return null
}

async function downloadPackage(page, label, destination) {
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: label, exact: true }).click()
  const download = await downloadPromise
  await download.saveAs(destination)
  const blob = new Blob([fs.readFileSync(destination)])
  return {
    entries: await readStoreZip(blob),
    suggestedName: download.suggestedFilename(),
  }
}

async function main() {
  const executablePath = findChrome()
  if (!executablePath) throw new Error("找不到 Chromium")
  const baseUrl = process.env.EXPORT_VERIFY_BASE || "http://localhost:3237"
  const browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45000 })
  const sampleResponse = await context.request.post(`${baseUrl}/api/sample`)
  const samplePayload = await sampleResponse.json()
  const oldProjectId = samplePayload?.data?.project?.id
  if (!sampleResponse.ok() || !oldProjectId) throw new Error("示例项目没有创建成功")

  await page.goto(`${baseUrl}/?step=shots&project=${oldProjectId}`, { waitUntil: "networkidle" })
  await page.evaluate((projectId) => {
    localStorage.setItem(`chengju:brief:${projectId}`, JSON.stringify({
      emotion: "克制",
      audience: "25-35 女性",
      references: "漫长的季节",
      redline: "不要爽剧化",
    }))
    localStorage.setItem(`chengju:look:${projectId}`, JSON.stringify({
      palette: "冷蓝、低饱和",
      light: "顶光",
      lens: "长焦",
      banned: "霓虹",
    }))
    localStorage.setItem(`chengju:judgments:${projectId}`, JSON.stringify([{
      id: "j-export",
      at: Date.now(),
      step: "manual",
      action: "手记",
      reason: "结尾留白",
    }]))
  }, oldProjectId)
  await page.reload({ waitUntil: "networkidle" })

  await page.getByRole("button", { name: "导出", exact: true }).click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-export-menu-desktop.png" })
  const delivery = await downloadPackage(
    page,
    "导出交付包",
    "D:\\Project\\drama-outline\\.tmp-export-delivery.zip",
  )
  const deliveryProject = JSON.parse(new TextDecoder().decode(delivery.entries.get("project.json")))
  if (deliveryProject.schemaVersion !== 2 || deliveryProject.mode !== "delivery") {
    throw new Error("交付包 schema 或 mode 不正确")
  }
  if (deliveryProject.project.title !== "示例 · 快递员的最后一单") {
    throw new Error(`交付包没有使用真实项目名：${deliveryProject.project.title}`)
  }
  if (deliveryProject.projectSettings.brief.redline !== "不要爽剧化") {
    throw new Error("交付包没有带上创作意图")
  }
  if (deliveryProject.snapshots.length !== 0) throw new Error("交付包不应包含完整快照历史")
  if (!delivery.entries.has("production/chaining.txt")) throw new Error("交付包缺少 chaining.txt")
  if (!delivery.entries.has("storyboard/index.html")) throw new Error("交付包缺少离线分镜")
  if (!delivery.entries.has("export-report.json")) throw new Error("交付包缺少导出报告")

  await page.getByRole("button", { name: "导出", exact: true }).click().catch(() => {})
  if (!(await page.getByRole("button", { name: "导出完整备份", exact: true }).isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "导出", exact: true }).click()
  }
  const backup = await downloadPackage(
    page,
    "导出完整备份",
    "D:\\Project\\drama-outline\\.tmp-export-backup.zip",
  )
  const backupProject = JSON.parse(new TextDecoder().decode(backup.entries.get("project.json")))
  if (backupProject.mode !== "backup") throw new Error("完整备份 mode 不正确")
  if (backupProject.snapshots.length < 8) throw new Error("完整备份没有包含快照历史")
  if (backupProject.projectSettings.look.palette !== "冷蓝、低饱和") {
    throw new Error("完整备份没有带上视觉宪法")
  }

  const importInput = page.locator('input[type="file"]')
  await importInput.setInputFiles("D:\\Project\\drama-outline\\.tmp-export-backup.zip")
  await page.getByText(/已导入「示例 · 快递员的最后一单」/).waitFor({ timeout: 30000 })
  const newProjectId = new URL(page.url()).searchParams.get("project")
  if (!newProjectId || newProjectId === oldProjectId) throw new Error("导入后没有切换到新项目")
  const restoredBrief = await page.evaluate((projectId) => {
    const raw = localStorage.getItem(`chengju:brief:${projectId}`)
    return raw ? JSON.parse(raw) : null
  }, newProjectId)
  if (restoredBrief?.redline !== "不要爽剧化") throw new Error("导入后没有恢复创作意图")

  const mobile = await context.newPage()
  await mobile.setViewportSize({ width: 390, height: 844 })
  await mobile.goto(`${baseUrl}/?project=${newProjectId}`, { waitUntil: "networkidle" })
  await mobile.getByRole("button", { name: "导出", exact: true }).click()
  await mobile.waitForTimeout(350)
  const mobileButtons = await mobile.getByRole("button", {
    name: /导出交付包|导出完整备份|导入项目包/,
  }).count()
  if (mobileButtons !== 3) throw new Error(`移动端导出菜单按钮不完整：${mobileButtons}`)
  const mobileOverflow = await mobile.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth) {
    throw new Error(`移动端导出菜单横向溢出：${JSON.stringify(mobileOverflow)}`)
  }
  await mobile.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-export-menu-mobile.png" })

  console.log(JSON.stringify({
    oldProjectId,
    newProjectId,
    deliveryEntries: delivery.entries.size,
    backupSnapshots: backupProject.snapshots.length,
    deliveryName: delivery.suggestedName,
    backupName: backup.suggestedName,
    mobileOverflow,
    errors,
  }, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
