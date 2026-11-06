import fs from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright-core"

const baseUrl = process.env.VERIFY_BASE_URL || "http://localhost:3216"
const outputDir = path.resolve(process.env.VERIFY_OUTPUT_DIR || ".artifacts/novel-ui")
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

await fs.mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
})
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
const consoleErrors = []
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text())
})
page.on("pageerror", (error) => consoleErrors.push(error.message))

try {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" })
  const sampleResponse = await context.request.post(`${baseUrl}/api/sample`, { data: {} })
  if (!sampleResponse.ok()) throw new Error(`示例项目创建失败：${sampleResponse.status()}`)
  const sample = await sampleResponse.json()
  const projectId = sample?.data?.project?.id
  if (!projectId) throw new Error("示例项目没有返回 project id")

  await page.goto(`${baseUrl}/novels/${projectId}`, { waitUntil: "networkidle" })
  await page.getByRole("heading", { name: /把已经写好的分集/ }).waitFor()
  await page.screenshot({ path: path.join(outputDir, "novel-setup-1440.png"), fullPage: false })
  await page.setViewportSize({ width: 390, height: 667 })
  await page.waitForTimeout(250)
  await page.getByRole("button", { name: /建立小说稿/ }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(outputDir, "novel-setup-390.png"), fullPage: false })
  const setupCheck = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollTop: window.scrollY,
    presetCount: document.querySelectorAll(".novel-preset-list [role=radio]").length,
  }))
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.waitForTimeout(250)

  await page.getByRole("radio", { name: /标准长篇版/ }).click()
  await page.getByRole("button", { name: /建立小说稿/ }).click()
  await page.getByRole("dialog", { name: /标准长篇版/ }).waitFor({ timeout: 20_000 })
  await page.screenshot({ path: path.join(outputDir, "novel-budget-1440.png"), fullPage: false })
  await page.getByRole("button", { name: "暂不开始" }).click()
  await page.locator(".novel-outline").waitFor()
  await page.screenshot({ path: path.join(outputDir, "novel-workspace-1440.png"), fullPage: false })

  const desktopCheck = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    chapterCount: document.querySelectorAll(".novel-outline li").length,
    hasEditor: Boolean(document.querySelector(".novel-editor textarea")),
    hasInspector: Boolean(document.querySelector(".novel-inspector")),
  }))

  const editionsResponse = await context.request.get(`${baseUrl}/api/projects/${projectId}/novels`)
  const editions = (await editionsResponse.json())?.data?.editions || []
  const novelId = editions[0]?.id
  if (!novelId) throw new Error("没有可验证的小说稿")
  const workspaceResponse = await context.request.get(
    `${baseUrl}/api/projects/${projectId}/novels/${novelId}`,
  )
  const workspace = (await workspaceResponse.json())?.data
  const firstChapter = workspace?.chapters?.[0]
  if (!firstChapter) throw new Error("没有可验证的章节")
  const chapterContent = [
    "雨在凌晨两点以后变得密了。旧报社的玻璃门被风顶了一下，又慢慢退回去，像有人站在外面犹豫。",
    "",
    "林远把伞收在门边，水顺着伞骨滴到地砖上。他没有开顶灯，只借着走廊尽头那盏值班灯，把牛皮纸袋放在前台。纸袋没有寄件人的名字，封口处却压着一枚很旧的报社钢印。",
    "",
    "他认得这枚钢印。十年前，父亲最后一次来报社时，带走的也是这种档案袋。",
    "",
    "走廊里传来纸张摩擦的声音。林远抬头，看见档案室的门开了一线。门后没有人，只有一只倒下的铁皮文件盒，和散在地上的一页人事表。",
    "",
    "他蹲下去，把纸捡起来。发黄的格子里，父亲的名字被人用钢笔圈了两次。下面还有一行更淡的字：今晚不要回档案室。",
    "",
    "手机在这时震动。屏幕上只有一条陌生号码发来的短信。",
    "",
    "「你已经看见那一页了。」",
  ].join("\n")
  const patchResponse = await context.request.patch(
    `${baseUrl}/api/projects/${projectId}/novels/${novelId}/chapters/${firstChapter.id}`,
    { data: { content: chapterContent, summary: "林远在旧报社收到匿名档案，并发现父亲留下的人事表。" } },
  )
  if (!patchResponse.ok()) throw new Error(`章节演示写入失败：${patchResponse.status()}`)
  await page.reload({ waitUntil: "networkidle" })
  await page.locator(".novel-paper textarea").waitFor()
  await page.screenshot({ path: path.join(outputDir, "novel-chapter-1440.png"), fullPage: false })

  await page.setViewportSize({ width: 768, height: 900 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(outputDir, "novel-workspace-768.png"), fullPage: false })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.getByRole("tab", { name: "目录" }).click()
  await page.screenshot({ path: path.join(outputDir, "novel-mobile-outline-390.png"), fullPage: false })
  await page.getByRole("tab", { name: "正文" }).click()
  await page.screenshot({ path: path.join(outputDir, "novel-mobile-editor-390.png"), fullPage: false })
  const editorBoxes = await page.evaluate(() => {
    const source = document.querySelector(".novel-editor-head > div:first-child > span")
    const title = document.querySelector(".novel-editor-head input")
    const actions = document.querySelector(".novel-editor-actions")
    const box = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }
    return { source: box(source), title: box(title), actions: box(actions) }
  })
  await page.getByRole("tab", { name: "检查" }).click()
  await page.screenshot({ path: path.join(outputDir, "novel-mobile-inspect-390.png"), fullPage: false })
  await page.getByRole("button", { name: "小说稿选项" }).click()
  await page.getByRole("button", { name: "Markdown", exact: true }).waitFor()
  await page.screenshot({ path: path.join(outputDir, "novel-mobile-more-390.png"), fullPage: false })

  const mobileCheck = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    activePane: document.querySelector(".novel-inspector.is-mobile-active")?.className || "",
    mobileTabsVisible: getComputedStyle(document.querySelector(".novel-mobile-tabs")).display !== "none",
  }))

  const result = {
    projectId,
    screenshots: [
      "novel-setup-1440.png",
      "novel-setup-390.png",
      "novel-budget-1440.png",
      "novel-workspace-1440.png",
      "novel-chapter-1440.png",
      "novel-workspace-768.png",
      "novel-mobile-outline-390.png",
      "novel-mobile-editor-390.png",
      "novel-mobile-inspect-390.png",
      "novel-mobile-more-390.png",
    ],
    desktopCheck,
    setupCheck,
    editorBoxes,
    mobileCheck,
    consoleErrors,
  }
  if (desktopCheck.scrollWidth > desktopCheck.viewport) throw new Error("桌面端存在横向溢出")
  if (setupCheck.scrollWidth > setupCheck.viewport) throw new Error("移动端空态存在横向溢出")
  if (mobileCheck.scrollWidth > mobileCheck.viewport) throw new Error("移动端存在横向溢出")
  if (!desktopCheck.hasEditor || !desktopCheck.hasInspector) throw new Error("桌面工作区布局不完整")
  if (!mobileCheck.mobileTabsVisible || !mobileCheck.activePane) throw new Error("移动端视图切换不完整")
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
