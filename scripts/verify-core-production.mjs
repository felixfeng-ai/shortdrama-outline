import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { createServer, get as httpGet } from "node:http"
import net from "node:net"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "playwright-core"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const evidenceDir = path.join(repoRoot, ".artifacts", "core-production-e2e")
const require = createRequire(import.meta.url)
const ffprobePath = require("@ffprobe-installer/ffprobe").path
await mkdir(evidenceDir, { recursive: true })
await Promise.all([
  rm(path.join(evidenceDir, "failure.png"), { force: true }),
  rm(path.join(evidenceDir, "server.log"), { force: true }),
  rm(path.join(evidenceDir, "failure-crop.png"), { force: true }),
  rm(path.join(evidenceDir, "failure-crop2.png"), { force: true }),
])

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let lastStatus = "no response"
  while (Date.now() < deadline) {
    const status = await new Promise((resolve) => {
      const request = httpGet(url, (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      })
      request.setTimeout(1_500, () => {
        request.destroy()
        resolve(0)
      })
      request.on("error", () => resolve(0))
    })
    lastStatus = String(status)
    if (status === 200) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const tail = serverLogs.trim().slice(-4_000)
  throw new Error(
    `服务未在 ${timeoutMs}ms 内就绪：${url}（最后状态：${lastStatus}）` +
    (tail ? `\n--- server log ---\n${tail}` : ""),
  )
}

let serverProcess = null
let mockServer = null
let mockBaseUrl = ""
let lastSubmit = null
let baseUrl = process.env.BASE_URL?.replace(/\/$/, "") || ""
let tempDir = ""
let serverLogs = ""

async function startMockProvider() {
  const port = await freePort()
  mockBaseUrl = `http://127.0.0.1:${port}`
  const videoBytes = fs.readFileSync(
    path.join(repoRoot, "public", "sample", "sample-production.mp4"),
  )
  mockServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", mockBaseUrl)
    const json = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
      res.end(JSON.stringify(payload))
    }
    if (req.method === "POST" && url.pathname === "/v2/video_generation") {
      let body = ""
      for await (const chunk of req) body += chunk.toString()
      const payload = JSON.parse(body || "{}")
      lastSubmit = {
        model: payload.model,
        resolution: payload.resolution,
        duration: payload.duration,
        ratio: payload.ratio,
        hasFirstFrame: Array.isArray(payload.content)
          && payload.content.some((item) => item?.role === "first_frame"),
      }
      json(200, { task_id: "mock-video-task" })
      return
    }
    if (
      req.method === "GET"
      && url.pathname === "/v2/query/video_generation/mock-video-task"
    ) {
      json(200, {
        task: {
          status: "succeeded",
          content: { url: `${mockBaseUrl}/mock.mp4` },
          duration: lastSubmit?.duration ?? 6,
          resolution: lastSubmit?.resolution ?? "768P",
          ratio: "9:16",
          usage: {},
        },
      })
      return
    }
    if (req.method === "GET" && url.pathname === "/mock.mp4") {
      res.writeHead(200, {
        "content-type": "video/mp4",
        "content-length": String(videoBytes.length),
      })
      res.end(videoBytes)
      return
    }
    if (req.method === "GET" && url.pathname === "/lastSubmit") {
      json(200, lastSubmit)
      return
    }
    if (
      req.method === "DELETE"
      && url.pathname === "/v2/video_generation/mock-video-task"
    ) {
      json(200, { success: true })
      return
    }
    json(404, { error: { message: "mock route not found" } })
  })
  await new Promise((resolve, reject) => {
    mockServer.once("error", reject)
    mockServer.listen(port, "127.0.0.1", resolve)
  })
}

if (!baseUrl) {
  await startMockProvider()
  const port = Number(process.env.PORT) || await freePort()
  tempDir = await mkdtemp(path.join(os.tmpdir(), "veya-core-e2e-"))
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
  serverProcess = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CHENGJU_DATA_DIR: path.join(tempDir, "data"),
      CHENGJU_GENERATED_DIR: path.join(tempDir, "generated"),
      AUTH_ALLOW_DEV_CODE: "0",
      TTS_ENABLED: "0",
      VIDEO_GENERATION_ENABLED: "1",
      MINIMAX_API_KEY: "mock-key",
      MINIMAX_VIDEO_BASE_URL: mockBaseUrl,
      MINIMAX_VIDEO_MODEL: "MiniMax-H3-Lite",
      MINIMAX_VIDEO_RESOLUTION: "768P",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  serverProcess.stdout.on("data", (chunk) => {
    serverLogs += chunk.toString()
  })
  serverProcess.stderr.on("data", (chunk) => {
    serverLogs += chunk.toString()
  })
  baseUrl = `http://127.0.0.1:${port}`
  try {
    await waitForUrl(`${baseUrl}/api/health`, 60_000)
  } catch (error) {
    fs.writeFileSync(
      path.join(evidenceDir, "server.log"),
      `${serverLogs}\n--- probe failure ---\n${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    )
    if (serverProcess) serverProcess.kill("SIGTERM")
    if (mockServer) await new Promise((resolve) => mockServer.close(resolve))
    throw error
  }
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : null,
    (() => {
      try {
        return chromium.executablePath()
      } catch {
        return null
      }
    })(),
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate))
}

const executablePath = chromeExecutable()
if (!executablePath) {
  throw new Error("没有可用的 Chromium/Chrome；请设置 CHROME_PATH 或安装 Playwright Chromium")
}

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
})
await context.addCookies([{
  name: "chengju_sid",
  value: "anon_local_development_session_0000000000000000",
  domain: new URL(baseUrl).hostname,
  path: "/",
}])

const page = await context.newPage()
const consoleErrors = []
function watchPage(target) {
  target.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  target.on("pageerror", (error) => consoleErrors.push(error.message))
}
watchPage(page)

try {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: /查看完整示例项目/ }).click()
  await page.waitForURL((url) => Boolean(url.searchParams.get("project")) && !url.searchParams.has("view"), {
    timeout: 30_000,
  })
  await page.waitForTimeout(3_000)

  const projectId = new URL(page.url()).searchParams.get("project")
  if (!projectId) throw new Error("示例项目 URL 缺少 project")
  await page.getByRole("navigation", { name: "当前项目步骤" }).waitFor()
  await page.screenshot({
    path: path.join(evidenceDir, "sample-overview-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })

  await page.goto(`${baseUrl}/?project=${projectId}&step=shots`, {
    waitUntil: "domcontentloaded",
  })
  await page.locator("#shot-workspace-video").click()
  const videoPanel = page.locator(".batch-video-panel")
  await videoPanel.waitFor()
  await videoPanel.locator(".batch-generation-head .batch-generation-toggle").click()
  const firstShotRow = videoPanel.locator(".batch-generation-row").first()
  await firstShotRow.waitFor()
  await firstShotRow.getByRole("button", { name: /导入外部视频/ }).waitFor()
  await firstShotRow.locator('input[type="file"]').setInputFiles(
    path.join(repoRoot, "public", "sample", "sample-production.mp4"),
  )
  await page.getByText("已导入第 1 镜外部视频并采用。").waitFor({ timeout: 30_000 })
  await page.getByText(/外部导入/).first().waitFor()
  await page.screenshot({
    path: path.join(evidenceDir, "shot-video-import-ready-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const importMobileOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  if (importMobileOverflow) throw new Error("390px 外部视频导入出现横向溢出")
  await page.screenshot({
    path: path.join(evidenceDir, "shot-video-import-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 1000 })

  await videoPanel.getByText(/智能推荐/).waitFor()
  const modelSelect = videoPanel.getByLabel("选择视频模型")
  const resolutionSelect = videoPanel.getByLabel("选择视频分辨率")
  if (await modelSelect.inputValue() !== "MiniMax-H3-Lite") {
    throw new Error("标准档没有匹配 MiniMax-H3-Lite")
  }
  if (await resolutionSelect.inputValue() !== "768P") {
    throw new Error("标准档没有匹配 768P")
  }
  await videoPanel.getByRole("button", { name: "成片", exact: true }).click()
  await page.waitForFunction(() => {
    const panel = document.querySelector(".batch-video-panel")
    const model = panel?.querySelector('select[aria-label="选择视频模型"]')
    const resolution = panel?.querySelector('select[aria-label="选择视频分辨率"]')
    return model?.value === "MiniMax-H3" && resolution?.value === "2K"
  })
  await modelSelect.selectOption("MiniMax-H3-Lite")
  await page.waitForTimeout(250)
  if (await modelSelect.inputValue() !== "MiniMax-H3-Lite") {
    throw new Error("手动模型选择被智能推荐覆盖")
  }
  await videoPanel.getByRole("button", { name: "使用推荐" }).click()
  await page.waitForFunction(() => {
    const panel = document.querySelector(".batch-video-panel")
    const model = panel?.querySelector('select[aria-label="选择视频模型"]')
    const resolution = panel?.querySelector('select[aria-label="选择视频分辨率"]')
    return model?.value === "MiniMax-H3" && resolution?.value === "2K"
  })
  await page.screenshot({
    path: path.join(evidenceDir, "video-routing-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const routingMobileOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  if (routingMobileOverflow) throw new Error("390px 视频智能推荐出现横向溢出")
  await page.screenshot({
    path: path.join(evidenceDir, "video-routing-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 1000 })

  await videoPanel.getByRole("button", { name: "清空" }).click()
  const generationRow = videoPanel.locator(".batch-generation-row").nth(1)
  await generationRow.getByRole("checkbox").check()
  const generateOne = videoPanel.getByRole("button", { name: "开始生成 1 镜" })
  await generateOne.waitFor()
  await generateOne.click()
  await videoPanel.getByRole("button", { name: "采用并加入时间线" }).first()
    .waitFor({ timeout: 60_000 })
  const submitted = await (await fetch(`${mockBaseUrl}/lastSubmit`)).json()
  if (
    submitted.model !== "MiniMax-H3"
    || submitted.resolution !== "2K"
    || submitted.duration !== 6
    || submitted.hasFirstFrame !== true
  ) {
    throw new Error(`mock 供应商收到的请求不符：${JSON.stringify(submitted)}`)
  }
  await videoPanel.getByRole("button", { name: "采用并加入时间线" }).first().click()
  await page.getByText("已采用第 2 镜视频；旧时间线草稿可一键同步更新。").waitFor()
  await page.screenshot({
    path: path.join(evidenceDir, "internal-video-generated-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const internalVideoMobileOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  if (internalVideoMobileOverflow) throw new Error("390px 内部视频候选出现横向溢出")
  await page.screenshot({
    path: path.join(evidenceDir, "internal-video-generated-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const batchSource = fs.readFileSync(
    path.join(repoRoot, "public", "sample", "sample-production.mp4"),
  )
  await videoPanel.locator('.batch-generation-head-actions input[type="file"]').setInputFiles([
    {
      name: "E01-S03.mp4",
      mimeType: "video/mp4",
      buffer: batchSource,
    },
    {
      name: "take-from-jimeng.mp4",
      mimeType: "video/mp4",
      buffer: batchSource,
    },
  ])
  const batchDialog = page.getByRole("dialog", { name: "批量导入外部视频" })
  await batchDialog.waitFor()
  await batchDialog.getByText("1 个可导入", { exact: true }).waitFor()
  await batchDialog.getByLabel("为 take-from-jimeng.mp4 选择镜头")
    .selectOption({ label: "第 3 集 · 镜 02" })
  await batchDialog.getByText("2 个可导入", { exact: true }).waitFor()
  await page.screenshot({
    path: path.join(evidenceDir, "external-video-batch-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const batchDialogOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  if (batchDialogOverflow) throw new Error("390px 批量导入预览出现横向溢出")
  await page.screenshot({
    path: path.join(evidenceDir, "external-video-batch-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await batchDialog.getByRole("button", { name: "确认导入 2 个" }).click()
  await page.getByText("已批量导入并采用 2 条外部视频。").waitFor({ timeout: 30_000 })
  await page.goto(`${baseUrl}/?project=${projectId}`, {
    waitUntil: "domcontentloaded",
  })

  const storyboardLink = page.getByRole("link", { name: /播放动态分镜/ })
  await storyboardLink.waitFor({ timeout: 20_000 })
  const [storyboardPage] = await Promise.all([
    context.waitForEvent("page"),
    storyboardLink.click(),
  ])
  watchPage(storyboardPage)
  await storyboardPage.waitForLoadState("domcontentloaded")
  await storyboardPage.getByText("真实已采用素材").waitFor()
  await storyboardPage.getByText("5 镜 · 30 秒").waitFor()
  await storyboardPage.getByText("4 视频 · 1 首帧").waitFor()
  await storyboardPage.locator(".storyboard-frame video").waitFor()

  const progressLabel = storyboardPage.locator(".storyboard-progress span")
  await storyboardPage.locator('.storyboard-control-buttons button[aria-label="播放"]').click()
  await storyboardPage.waitForTimeout(1_200)
  if (await progressLabel.innerText() === "00:00 / 00:30") {
    throw new Error("动态分镜播放进度没有前进")
  }
  await storyboardPage.locator('.storyboard-control-buttons button[aria-label="下一镜"]').click()
  await storyboardPage.locator(".storyboard-frame-meta b").filter({ hasText: "镜 02" }).waitFor()
  await storyboardPage.screenshot({
    path: path.join(evidenceDir, "storyboard-ready-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })

  await storyboardPage.getByRole("button", { name: "导出分享视频" }).click()
  const exportDialog = storyboardPage.getByRole("dialog", { name: "导出分享视频" })
  await exportDialog.waitFor()
  await exportDialog.getByText("自动配音", { exact: true }).waitFor()
  await exportDialog.getByText(/自动配音未启用或未配置价格/).waitFor()
  await storyboardPage.screenshot({
    path: path.join(evidenceDir, "storyboard-export-dialog-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })
  await storyboardPage.getByRole("button", { name: "确认并导出" }).click()
  await exportDialog.waitFor({ state: "detached" })
  await storyboardPage.getByRole("status").filter({ hasText: "正在渲染分享视频" }).waitFor()
  await storyboardPage.screenshot({
    path: path.join(evidenceDir, "storyboard-export-running-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })
  await storyboardPage.locator('.storyboard-control-buttons button[aria-label="暂停"]').click()
  await storyboardPage.locator('.storyboard-control-buttons button[aria-label="播放"]').click()

  const downloadMp4 = storyboardPage.getByRole("link", { name: "下载 MP4" })
  await downloadMp4.waitFor({ timeout: 180_000 })
  await storyboardPage.screenshot({
    path: path.join(evidenceDir, "storyboard-export-ready-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })

  const mp4Path = path.join(evidenceDir, "storyboard-share.mp4")
  const [mp4Download] = await Promise.all([
    storyboardPage.waitForEvent("download"),
    downloadMp4.click(),
  ])
  await mp4Download.saveAs(mp4Path)

  const srtPath = path.join(evidenceDir, "storyboard-share.srt")
  const [srtDownload] = await Promise.all([
    storyboardPage.waitForEvent("download"),
    storyboardPage.getByRole("link", { name: "下载 SRT" }).click(),
  ])
  await srtDownload.saveAs(srtPath)

  const probe = spawnSync(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-show_entries",
    "stream=codec_type,width,height",
    "-of",
    "json",
    mp4Path,
  ], { encoding: "utf8" })
  if (probe.status !== 0) {
    throw new Error(`FFprobe 无法读取分享视频：${probe.stderr}`)
  }
  const mediaInfo = JSON.parse(probe.stdout)
  const videoTrack = mediaInfo.streams.find((stream) => stream.codec_type === "video")
  const audioTrack = mediaInfo.streams.find((stream) => stream.codec_type === "audio")
  if (!videoTrack || videoTrack.height <= videoTrack.width) {
    throw new Error("分享视频缺少竖屏视频轨")
  }
  if (!audioTrack) throw new Error("分享视频缺少系统 BGM 音频轨")
  if (Math.abs(Number(mediaInfo.format.duration) - 30) > 0.5) {
    throw new Error(`分享视频时长不符：${mediaInfo.format.duration}s`)
  }
  const srtText = fs.readFileSync(srtPath, "utf8")
  if (
    !srtText.includes("1\r\n00:00:06,000")
    || !srtText.includes("2\r\n00:00:18,000")
    || !srtText.includes("苏婉")
    || !srtText.includes("这东西，我不认")
  ) {
    throw new Error("分享视频 SRT 缺少真实对白")
  }

  await storyboardPage.setViewportSize({ width: 390, height: 844 })
  await storyboardPage.reload({ waitUntil: "domcontentloaded" })
  await storyboardPage.getByText("5 镜 · 30 秒").waitFor()
  await storyboardPage.getByRole("link", { name: "下载 MP4" }).waitFor()
  const storyboardOverflow = await storyboardPage.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  if (storyboardOverflow) throw new Error("390px 动态分镜出现横向溢出")
  await storyboardPage.screenshot({
    path: path.join(evidenceDir, "storyboard-ready-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await storyboardPage.getByRole("button", { name: "导出分享视频" }).click()
  const mobileExportDialog = storyboardPage.getByRole("dialog", { name: "导出分享视频" })
  await mobileExportDialog.waitFor()
  const exportDialogOverflow = await storyboardPage.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  if (exportDialogOverflow) throw new Error("390px 导出弹层出现横向溢出")
  await storyboardPage.screenshot({
    path: path.join(evidenceDir, "storyboard-export-dialog-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await storyboardPage.getByRole("button", { name: "取消" }).click()
  await storyboardPage.close()

  const emptyProjectResponse = await page.request.post(`${baseUrl}/api/projects`, {
    data: { title: "动态分镜不足验收" },
  })
  const emptyProjectPayload = await emptyProjectResponse.json()
  if (!emptyProjectResponse.ok() || !emptyProjectPayload.success) {
    throw new Error(`创建 insufficient 验收项目失败：${emptyProjectPayload.error || emptyProjectResponse.status()}`)
  }
  const insufficientPage = await context.newPage()
  watchPage(insufficientPage)
  const emptyProjectId = emptyProjectPayload.data.project.id
  await insufficientPage.goto(`${baseUrl}/storyboard/${emptyProjectId}`, {
    waitUntil: "domcontentloaded",
  })
  await insufficientPage.getByText("真实素材不足", { exact: true }).waitFor()
  await insufficientPage.getByRole("heading", { name: "还差 30 秒" }).waitFor()
  await insufficientPage.screenshot({
    path: path.join(evidenceDir, "storyboard-insufficient.png"),
    fullPage: true,
    animations: "disabled",
  })
  await insufficientPage.close()

  await page.goto(`${baseUrl}/?project=${projectId}&step=shots`, {
    waitUntil: "domcontentloaded",
  })
  await page.getByRole("button", { name: /时间线成片/ }).click()
  const episodeSelect = page.locator(".episode-timeline-actions select")
  await episodeSelect.waitFor()
  await episodeSelect.selectOption("1")
  const sampleVideo = page.locator('video[src*="/api/video/renders/"]').first()
  await sampleVideo.waitFor({ timeout: 20_000 })
  if (!(await sampleVideo.getAttribute("src"))) throw new Error("示例成片没有视频地址")
  const media = await sampleVideo.evaluate(async (video) => {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise((resolve, reject) => {
        const onReady = () => {
          cleanup()
          resolve()
        }
        const onError = () => {
          cleanup()
          reject(new Error("示例成片加载失败"))
        }
        const cleanup = () => {
          video.removeEventListener("loadedmetadata", onReady)
          video.removeEventListener("error", onError)
        }
        video.addEventListener("loadedmetadata", onReady, { once: true })
        video.addEventListener("error", onError, { once: true })
      })
    }
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    }
  })
  if (media.width !== 1080 || media.height !== 1920) {
    throw new Error(`示例成片尺寸不符：${media.width}x${media.height}`)
  }
  if (Math.abs(media.duration - 6) > 0.15) {
    throw new Error(`示例成片时长不符：${media.duration}s`)
  }

  await page.goto(`${baseUrl}/delivery/${projectId}`, {
    waitUntil: "domcontentloaded",
  })
  const createPackage = page.getByRole("button", { name: "创建交付包" })
  await createPackage.waitFor({ timeout: 20_000 })
  await createPackage.click()
  await page.getByRole("link", { name: "下载交付包" }).waitFor({ timeout: 90_000 })
  await page.screenshot({
    path: path.join(evidenceDir, "delivery-ready-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/?project=${projectId}&step=shots`, {
    waitUntil: "domcontentloaded",
  })
  await page.getByRole("button", { name: "展开工作舱" }).click()
  await page.getByRole("region", { name: "Veya Agent" }).waitFor()
  const agentAnswer = page.locator("#deck-pane-agent .agent-answer-bubble p")
  await agentAnswer.waitFor()
  const answerBeforeCollapse = await agentAnswer.innerText()
  await page.getByRole("button", { name: "收起工作舱" }).click()
  await page.getByRole("button", { name: "展开工作舱" }).click()
  await page.getByRole("region", { name: "Veya Agent" }).waitFor()
  if (await agentAnswer.innerText() !== answerBeforeCollapse) {
    throw new Error("移动工作舱收起后丢失了 Agent 对话")
  }
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  if (overflow) throw new Error("390px 页面出现横向溢出")
  await page.screenshot({
    path: path.join(evidenceDir, "agent-mobile.png"),
    fullPage: false,
    animations: "disabled",
  })

  if (consoleErrors.length > 0) {
    throw new Error(`浏览器控制台错误：${consoleErrors.join(" | ")}`)
  }

  console.log(JSON.stringify({
    baseUrl,
    projectId,
    checked: [
      "起始页按钮载入完整示例",
      "示例总览",
      "外部 MP4 导入第 1 镜并采用",
      "镜头视频标准/成片智能匹配",
      "本地 mock 内部视频生成、轮询与采用",
      "批量外部视频命名映射与预览导入",
      "30 秒动态分镜播放与切镜",
      "浏览器导出并下载 30 秒 MP4/SRT",
      "FFprobe 验证视频轨、系统 BGM 与对白字幕",
      "动态分镜 insufficient 状态",
      "示例成片播放器",
      "1080P 交付包",
      "移动 Agent 收起再展开保留对话",
    ],
    screenshots: evidenceDir,
  }, null, 2))
} catch (error) {
  await page.screenshot({
    path: path.join(evidenceDir, "failure.png"),
    fullPage: true,
    animations: "disabled",
  }).catch(() => {})
  if (serverLogs) {
    fs.writeFileSync(path.join(evidenceDir, "server.log"), serverLogs)
  }
  throw error
} finally {
  await browser.close()
  if (serverProcess) {
    serverProcess.kill("SIGTERM")
  }
  if (mockServer) {
    await new Promise((resolve) => mockServer.close(resolve))
  }
}
