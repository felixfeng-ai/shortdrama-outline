const { chromium } = require("playwright-core")
const fs = require("fs")
const path = require("path")

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

async function overflowReport(page) {
  return page.evaluate(() => {
    const documentWidth = document.documentElement.scrollWidth
    const viewportWidth = document.documentElement.clientWidth
    const offenders = [...document.querySelectorAll(".batch-generation *")]
      .filter((node) => {
        const rect = node.getBoundingClientRect()
        return rect.right > viewportWidth + 1 || rect.left < -1
      })
      .slice(0, 5)
      .map((node) => `${node.tagName}.${node.className}`)
    return { documentWidth, viewportWidth, offenders }
  })
}

async function main() {
  const executablePath = findChrome()
  if (!executablePath) throw new Error("找不到 Chromium")
  const baseUrl = process.env.BATCH_VERIFY_BASE || "http://localhost:3236"

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
  const projectId = samplePayload?.data?.project?.id
  if (!sampleResponse.ok() || !projectId) throw new Error(`示例项目没有创建成功: ${JSON.stringify(samplePayload)}`)

  await page.goto(`${baseUrl}/?step=visuals&project=${projectId}`, { waitUntil: "networkidle" })
  await page.getByRole("heading", { name: "批量生成角色定妆" }).waitFor()
  const rolePanel = page.getByRole("region", { name: "批量生成角色定妆" })
  await rolePanel.getByRole("button", { name: "选择生图项目" }).click()
  await rolePanel.getByText("低并发 2", { exact: true }).waitFor()
  await page.waitForTimeout(350)
  const roleRows = await rolePanel.locator(".batch-generation-row").count()
  const roleOverflow = await overflowReport(page)
  if (roleRows < 1) throw new Error("角色批量列表没有目标")
  if (roleOverflow.documentWidth > roleOverflow.viewportWidth) {
    throw new Error(`角色批量桌面横向溢出: ${JSON.stringify(roleOverflow)}`)
  }
  await page.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-batch-role-desktop.png", fullPage: false })

  await page.goto(`${baseUrl}/?step=shots&project=${projectId}&episode=1`, { waitUntil: "networkidle" })
  await page.getByRole("heading", { name: /批量生成第 1 集首帧/ }).waitFor()
  const filterValue = await page.locator(".shot-episode-filter select").inputValue()
  if (filterValue !== "1") throw new Error(`分镜筛选没有读取 episode=1，当前为 ${filterValue}`)

  const episodeCell = page.locator('.shot-card-summary select[aria-label$="镜集号"]').first()
  await episodeCell.selectOption("2")
  await page.locator(".shot-episode-filter select").selectOption("2")
  const episodeTwoPanel = page.getByRole("region", { name: /批量生成第 2 集首帧/ })
  await episodeTwoPanel.getByRole("heading", { name: /批量生成第 2 集首帧/ }).waitFor()
  if (new URL(page.url()).searchParams.get("episode") !== "2") throw new Error("切换集数后 URL 没有同步")
  await episodeTwoPanel.getByRole("button", { name: "选择生图项目" }).click()
  await page.waitForTimeout(350)
  const episodeTwoRows = await episodeTwoPanel.locator(".batch-generation-row").count()
  if (episodeTwoRows !== 1) throw new Error(`第 2 集批量范围应只有 1 镜，实际 ${episodeTwoRows}`)

  await page.locator(".shot-episode-filter select").selectOption("all")
  await page.getByRole("heading", { name: /批量生成全剧首帧/ }).waitFor()
  if (new URL(page.url()).searchParams.has("episode")) throw new Error("切回全部集后 URL 仍保留 episode")
  await page.locator(".shot-episode-filter select").selectOption("1")
  const shotsPanel = page.getByRole("region", { name: /批量生成第 1 集首帧/ })
  await shotsPanel.getByRole("heading", { name: /批量生成第 1 集首帧/ }).waitFor()
  const firstEpisodeToggle = shotsPanel.locator(".batch-generation-toggle")
  if ((await firstEpisodeToggle.textContent())?.includes("选择生图项目")) await firstEpisodeToggle.click()
  await page.waitForTimeout(350)
  const shotRows = await shotsPanel.locator(".batch-generation-row").count()
  if (shotRows < 1) throw new Error("第 1 集没有可审阅镜头")
  await shotsPanel.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const shotOverflow = await overflowReport(page)
  if (shotOverflow.documentWidth > shotOverflow.viewportWidth) {
    throw new Error(`分镜批量桌面横向溢出: ${JSON.stringify(shotOverflow)}`)
  }
  await page.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-batch-shot-desktop.png", fullPage: false })

  const mobile = await context.newPage()
  await mobile.setViewportSize({ width: 390, height: 844 })
  mobile.on("console", (message) => {
    if (message.type() === "error") errors.push(`MOBILE: ${message.text()}`)
  })
  mobile.on("pageerror", (error) => errors.push(`MOBILE PAGEERROR: ${error.message}`))
  await mobile.goto(`${baseUrl}/?step=shots&project=${projectId}&episode=1`, { waitUntil: "networkidle" })
  const mobilePanel = mobile.getByRole("region", { name: /批量生成第 1 集首帧/ })
  await mobilePanel.getByRole("heading", { name: /批量生成第 1 集首帧/ }).waitFor()
  await mobilePanel.getByRole("button", { name: "选择生图项目" }).click()
  await mobile.waitForTimeout(350)
  await mobilePanel.scrollIntoViewIfNeeded()
  const mobileRows = await mobilePanel.locator(".batch-generation-row").count()
  const mobileOverflow = await overflowReport(mobile)
  if (mobileRows < 1) throw new Error("移动端批量列表没有目标")
  if (mobileOverflow.documentWidth > mobileOverflow.viewportWidth || mobileOverflow.offenders.length > 0) {
    throw new Error(`移动端横向溢出: ${JSON.stringify(mobileOverflow)}`)
  }
  await mobile.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-batch-shot-mobile.png", fullPage: false })

  console.log(JSON.stringify({
    projectId,
    roleRows,
    shotRows,
    mobileRows,
    roleOverflow,
    shotOverflow,
    mobileOverflow,
    errors,
  }, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
