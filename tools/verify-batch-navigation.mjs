import { chromium } from "playwright-core"
import fs from "node:fs"

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const baseUrl = process.env.BATCH_NAV_VERIFY_BASE || "http://localhost:3243"
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=",
  "base64",
)
const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const generated = new Map()
const errors = []
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text())
})
page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`))

await page.route("**/api/generated-assets/**", (route) =>
  route.fulfill({ status: 200, contentType: "image/png", body: png }))
await page.route("**/api/generations*", async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (request.method() === "GET") {
    const targetType = url.searchParams.get("targetType")
    const targetId = url.searchParams.get("targetId")
    const records = [...generated.values()].filter((item) =>
      (!targetType || item.task.targetType === targetType) &&
      (!targetId || item.task.targetId === targetId))
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          tasks: records.map((item) => item.task),
          assets: records.map((item) => item.asset),
        },
      }),
    })
  }

  const body = JSON.parse(request.postData() || "{}")
  await new Promise((resolve) => setTimeout(resolve, 900))
  const id = `fake-${String(body.targetId).replace(/[^A-Za-z0-9_-]/g, "-")}`
  const now = Date.now()
  const task = {
    id: `task-${id}`,
    projectId: body.projectId,
    targetType: body.targetType,
    targetId: body.targetId,
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: body.prompt,
    promptHash: "mock",
    status: "succeeded",
    error: null,
    assetId: id,
    createdAt: now,
    startedAt: now,
    finishedAt: now,
  }
  const asset = {
    id,
    taskId: task.id,
    projectId: body.projectId,
    targetType: body.targetType,
    targetId: body.targetId,
    storageKey: `mock/${id}.png`,
    mime: "image/png",
    bytes: png.length,
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: body.prompt,
    selectedAt: null,
    createdAt: now,
    downloadUrl: `/api/generated-assets/${id}`,
  }
  generated.set(`${body.targetType}:${body.targetId}`, { task, asset })
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { task, asset, referenceCount: 0 },
    }),
  })
})

await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
const sample = await context.request.post(`${baseUrl}/api/sample`)
const samplePayload = await sample.json()
const projectId = samplePayload?.data?.project?.id
if (!sample.ok() || !projectId) throw new Error("示例项目没有创建成功")

await page.goto(`${baseUrl}/?step=visuals&project=${projectId}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
})
const batch = page.getByRole("region", { name: "批量生成角色定妆" })
await batch.getByRole("heading", { name: "批量生成角色定妆" }).waitFor({ timeout: 60000 })
await batch.getByRole("button", { name: "选择生图项目" }).click()
await batch.getByRole("button", { name: /开始生成 3 项/ }).click()
await batch.getByText(/生成中 ·/).waitFor()

await page.locator('.navpanel button[aria-label="场次"]').click()
await page.getByRole("heading", { name: "生成场次剧本" }).waitFor()
await page.waitForTimeout(2300)

await page.locator('.navpanel button[aria-label="定妆"]').click()
const returnedBatch = page.getByRole("region", { name: "批量生成角色定妆" })
await returnedBatch.getByRole("heading", { name: "批量生成角色定妆" }).waitFor()
await page.getByText("已结束 · 3 项候选").waitFor({ timeout: 10000 })
const candidates = await page.getByText("候选版本 · 尚未采用").count()
if (candidates !== 3) throw new Error(`返回定妆后只展示了 ${candidates} 个候选`)
if (generated.size !== 3) throw new Error(`后台只完成 ${generated.size} 项`)
await page.screenshot({ path: "D:\\Project\\drama-outline\\.tmp-batch-navigation-return.png" })

console.log(JSON.stringify({ projectId, generated: generated.size, candidates, errors }, null, 2))
await browser.close()
