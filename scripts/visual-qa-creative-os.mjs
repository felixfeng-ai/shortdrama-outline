import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const baseURL = process.env.VISUAL_QA_URL || "http://localhost:3215"
const outputDir = path.resolve(".tmp-visual-qa")
fs.mkdirSync(outputDir, { recursive: true })

async function api(page, pathname, init = {}) {
  return page.evaluate(async ({ pathname, init }) => {
    const response = await fetch(pathname, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers || {}),
      },
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || `Request failed: ${pathname}`)
    }
    return payload.data
  }, { pathname, init })
}

async function assertNoViewportOverflow(page, label) {
  const measurement = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  if (measurement.scrollWidth > measurement.clientWidth + 2
    || measurement.bodyScrollWidth > measurement.clientWidth + 2) {
    throw new Error(`${label} has horizontal overflow: ${JSON.stringify(measurement)}`)
  }
}

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
})

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  await page.waitForTimeout(1_000)

  const sample = await api(page, "/api/sample", {
    method: "POST",
    body: "{}",
  })
  const project = sample.project || sample

  const skillData = await api(page, "/api/personal-skills", {
    method: "POST",
    body: JSON.stringify({
      name: "视觉 QA · 强钩子短剧",
      summary: "前三秒进入冲突，每集留一个信息增量。",
      mainDoc: "先核对人物动机，再写分集钩子；Canon 不通过时不进入分镜。",
      acceptance: ["前三秒能看懂冲突", "每集至少一个信息增量"],
      stageRules: { episodes: "结尾必须产生新信息" },
    }),
  })
  await api(page, `/api/projects/${encodeURIComponent(project.id)}/skill`, {
    method: "PUT",
    body: JSON.stringify({ skillId: skillData.skill.id, version: 1 }),
  })

  const shotSnapshots = await page.evaluate(async (projectId) => {
    const response = await fetch(`/api/snapshots?projectId=${encodeURIComponent(projectId)}&kind=shots`)
    return (await response.json()).data.snapshots
  }, project.id)
  const shots = shotSnapshots?.[0]?.payload ?? []
  if (shots[0]) {
    await api(page, `/api/projects/${encodeURIComponent(project.id)}/comments`, {
      method: "POST",
      body: JSON.stringify({
        targetType: "shot",
        targetId: shots[0].entityId || shots[0].id,
        body: "这一镜先保留环境声，不要急着切人物正脸。",
      }),
    })
  }

  const characterSnapshots = await page.evaluate(async (projectId) => {
    const response = await fetch(`/api/snapshots?projectId=${encodeURIComponent(projectId)}&kind=characters`)
    return (await response.json()).data.snapshots
  }, project.id)
  const characters = characterSnapshots?.[0]?.payload ?? []
  if (characters[0]) {
    await api(page, "/api/asset-library", {
      method: "POST",
      body: JSON.stringify({
        projectId: project.id,
        assetType: "character",
        name: characters[0].name,
        sourceAssetId: characters[0].id,
        content: characters[0],
      }),
    })
  }
  if (characterSnapshots?.[0]) {
    await api(page, `/api/projects/${encodeURIComponent(project.id)}/branches`, {
      method: "POST",
      body: JSON.stringify({
        name: "视觉 QA 分支",
        baseSnapshotId: characterSnapshots[0].id,
        note: "只验证分支记录和基线展示",
      }),
    })
  }

  await page.goto(`${baseURL}/?project=${encodeURIComponent(project.id)}&step=characters`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  })
  await page.waitForTimeout(600)
  await assertNoViewportOverflow(page, "desktop workbench")
  await page.screenshot({
    path: path.join(outputDir, "workbench-desktop-top.png"),
    fullPage: false,
  })

  await page.getByText("跨项目资产库", { exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({
    path: path.join(outputDir, "workbench-desktop-libraries.png"),
    fullPage: false,
  })

  await page.goto(`${baseURL}/skills?project=${encodeURIComponent(project.id)}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  })
  await page.getByText("我的 Skill", { exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await assertNoViewportOverflow(page, "desktop skills")
  await page.screenshot({
    path: path.join(outputDir, "skills-desktop.png"),
    fullPage: false,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseURL}/?project=${encodeURIComponent(project.id)}&step=characters`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  })
  await page.getByText("实体批注", { exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await assertNoViewportOverflow(page, "mobile workbench")
  await page.screenshot({
    path: path.join(outputDir, "workbench-mobile-libraries.png"),
    fullPage: false,
  })

  await page.goto(`${baseURL}/skills?project=${encodeURIComponent(project.id)}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  })
  await page.getByText("我的 Skill", { exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await assertNoViewportOverflow(page, "mobile skills")
  await page.screenshot({
    path: path.join(outputDir, "skills-mobile.png"),
    fullPage: false,
  })

  console.log(JSON.stringify({
    projectId: project.id,
    skillId: skillData.skill.id,
    screenshots: fs.readdirSync(outputDir).filter((file) => file.endsWith(".png")).sort(),
  }, null, 2))
} finally {
  await browser.close()
}
