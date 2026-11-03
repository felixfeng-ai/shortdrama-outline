import { chromium } from "playwright-core"
import fs from "node:fs"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const baseUrl = process.env.SKILLS_VERIFY_BASE || "http://localhost:3261"
const output = "D:\\Project\\drama-outline"

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const errors = []
const page = await context.newPage()
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text())
})
page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 })
const sample = await context.request.post(`${baseUrl}/api/sample`)
if (!sample.ok()) throw new Error("示例项目创建失败")
const samplePayload = await sample.json()
const sampleProject = samplePayload?.data?.project
if (!sampleProject?.id) throw new Error("示例项目没有返回 id")
await page.goto(`${baseUrl}/skills?project=${encodeURIComponent(sampleProject.id)}`, { waitUntil: "domcontentloaded", timeout: 60_000 })
await page.locator(".skill-card").first().waitFor()
await page.getByText(sampleProject.title, { exact: true }).first().waitFor()
await page.locator("#pageTitle").waitFor()
const pageTitle = await page.locator("#pageTitle").textContent()
if (!pageTitle?.includes("Skill") || !pageTitle.includes("你的短剧创作入口")) throw new Error("页面标题不正确")
const skillCount = await page.locator(".skill-card").count()
if (skillCount !== 6) throw new Error(`Skill 数量不正确：${skillCount}`)
const intakeLabels = await page.locator(".intake-mode").allTextContents()
if (intakeLabels.join("|") !== "从想法开始|从小说剧本开始|继续当前项目") {
  throw new Error(`创作起点不正确：${intakeLabels.join("|")}`)
}
await page.locator(".skill-card").last().scrollIntoViewIfNeeded()
await page.waitForFunction(
  () => [...document.querySelectorAll(".skill-visual img")].every(
    (image) => image.complete && image.naturalWidth > 0,
  ),
  null,
  { timeout: 20_000 },
)
const imageState = await page.locator(".skill-visual img").evaluateAll((images) =>
  images.map((image) => ({
    complete: image.complete,
    width: image.naturalWidth,
  })),
)
if (imageState.some((image) => !image.complete || image.width === 0)) throw new Error("Skill 缩略图加载失败")
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))

await page.locator('[data-category="交付效率"]').click()
if (await page.locator(".skill-card").count() !== 2) throw new Error("分类筛选不正确")
await page.locator('[data-category="全部"]').click()

await page.locator("#skill-prompt").fill("一个雨夜，快递员收到一封迟到四十年的信。")
await page.getByRole("button", { name: "从小说剧本开始" }).click()
await page.locator("#skill-prompt").fill("第一场 内景 旧楼门口\n苏婉没有开门。")
await page.getByRole("button", { name: "从想法开始" }).click()
if (!(await page.locator("#skill-prompt").inputValue()).includes("快递员")) {
  throw new Error("切换创作起点后没有保留想法草稿")
}
await page.getByRole("button", { name: "从小说剧本开始" }).click()
if (!(await page.locator("#skill-prompt").inputValue()).includes("苏婉没有开门")) {
  throw new Error("切换创作起点后没有保留原文草稿")
}
await page.locator("#localMaterialInput").setInputFiles({
  name: "苏婉剧本.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("第一场 内景 旧楼门口\n苏婉没有开门，门缝里掉出一张旧车票。"),
})
await page.locator(".project-material-row").first().waitFor({ timeout: 15_000 })
await page.getByText(/已读取 .*字/).waitFor({ timeout: 15_000 })
const materialApi = await context.request.get(
  `${baseUrl}/api/projects/${encodeURIComponent(sampleProject.id)}/materials?includeContent=1`,
)
const materialPayload = await materialApi.json()
if (!materialPayload?.data?.materials?.[0]?.content?.includes("苏婉没有开门")) {
  throw new Error("项目原文没有保存真实正文")
}
await page.reload({ waitUntil: "domcontentloaded" })
await page.locator(".project-material-row").first().waitFor({ timeout: 15_000 })
if (!page.url().includes("mode=source")) throw new Error("创作起点没有写入 URL")

await page.locator('.skill-card').filter({ hasText: "小说 / 剧本改编" }).click()
const promptValue = await page.locator("#skill-prompt").inputValue()
if (!promptValue.includes("18 章小说")) throw new Error("Skill 任务没有带入输入框")
await page.getByText("前置已满足").waitFor({ timeout: 15_000 })

const desktopOverflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (desktopOverflow.scrollWidth > desktopOverflow.clientWidth) throw new Error("桌面横向溢出")
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
await page.waitForTimeout(150)
await page.screenshot({ path: `${output}\\.tmp-skills-page-desktop.png` })

let agentPosted = ""
await context.route("**/api/agent", async (route) => {
  agentPosted = route.request().postData() ?? ""
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: {
        reply: "当前项目还有 2 个镜头缺参考图，建议先补齐林岚的定妆参考。",
        degraded: false,
      },
      error: null,
    }),
  })
})
await page.locator("#skill-prompt").fill("把原文整理成改编计划")
await page.locator(".send-button").click()
await page.locator(".agent-drawer.open").waitFor()
await page.getByText("已读取当前项目，写项目前一定问你").waitFor({ timeout: 15_000 })
await page.locator(".agent-messages .assistant-message").last().waitFor({ timeout: 15_000 })
const mainEntryPosted = agentPosted
if (!mainEntryPosted.includes("苏婉没有开门")) throw new Error("主输入入口没有收到项目原文正文")
await page.screenshot({ path: `${output}\\.tmp-skills-intake-agent.png` })

await page.getByRole("button", { name: "关闭场记" }).click()
agentPosted = ""
await page.getByRole("button", { name: "问场记" }).click()
await page.locator(".agent-drawer.open").waitFor()
const assistantCountBefore = await page.locator(".agent-messages .assistant-message").count()
await page.locator("#skill-agent-input").fill("把原文整理成改编计划")
await page.locator(".agent-compose button[type=submit]").click()
await page.waitForFunction(
  (count) => document.querySelectorAll(".agent-messages .assistant-message").length > count,
  assistantCountBefore,
  { timeout: 15_000 },
)
const drawerReply = (await page.locator(".agent-messages .assistant-message").last().textContent())?.trim() ?? ""
if (!drawerReply.includes("2 个镜头")) throw new Error(`场记抽屉没有返回模拟结果：${drawerReply}`)
if (!agentPosted.includes("苏婉没有开门")) throw new Error("场记抽屉入口没有收到项目原文正文")
if (!agentPosted.includes("项目原文")) throw new Error("Agent 上下文没有标明原文来源")
await page.waitForTimeout(250)
await page.screenshot({ path: `${output}\\.tmp-skills-page-agent.png` })

const mobile = await context.newPage()
mobile.on("console", (message) => {
  if (message.type() === "error") errors.push(`MOBILE: ${message.text()}`)
})
mobile.on("pageerror", (error) => errors.push(`MOBILE PAGEERROR: ${error.message}`))
await mobile.setViewportSize({ width: 390, height: 844 })
await mobile.goto(`${baseUrl}/skills?project=${encodeURIComponent(sampleProject.id)}`, { waitUntil: "domcontentloaded", timeout: 60_000 })
await mobile.locator(".skill-card").first().waitFor()
await mobile.locator(".top-project").filter({ hasText: sampleProject.title }).waitFor({ state: "attached" })
if (await mobile.locator(".skill-card").count() !== 6) throw new Error("手机 Skill 数量不正确")
const mobileModeBoxes = await mobile.locator(".intake-mode").evaluateAll((items) =>
  items.map((item) => ({
    text: item.textContent?.trim() ?? "",
    width: item.getBoundingClientRect().width,
    height: item.getBoundingClientRect().height,
    scrollWidth: item.scrollWidth,
    clientWidth: item.clientWidth,
  })),
)
if (mobileModeBoxes.length !== 3) throw new Error("手机创作起点数量不正确")
if (mobileModeBoxes.some((item) => item.height < 32 || item.scrollWidth > item.clientWidth + 1)) {
  throw new Error("手机创作起点文字被挤压")
}
await mobile.getByRole("button", { name: "从小说剧本开始" }).click()
await mobile.locator(".intake-preflight").waitFor()
await mobile.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
await mobile.screenshot({ path: `${output}\\.tmp-skills-intake-mobile.png`, fullPage: true })
await mobile.getByRole("button", { name: "问场记" }).click()
await mobile.locator(".agent-drawer.open").waitFor()
const mobileOverflow = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth) throw new Error("手机横向溢出")
await mobile.screenshot({ path: `${output}\\.tmp-skills-page-mobile.png`, fullPage: true })

console.log(JSON.stringify({
  skillCount,
  imageCount: imageState.length,
  promptValue,
  intakeLabels,
  mobileModeBoxes,
  materialCharacters: materialPayload.data.materials[0].characterCount,
  mainEntryReceivedMaterialText: mainEntryPosted.includes("苏婉没有开门"),
  drawerEntryReceivedMaterialText: agentPosted.includes("苏婉没有开门"),
  desktopOverflow,
  mobileOverflow,
  errors,
}, null, 2))
await browser.close()
