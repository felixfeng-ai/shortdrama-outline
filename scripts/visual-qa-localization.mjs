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
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || pathname)
    return payload.data
  }, { pathname, init })
}

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
})

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 })
  await page.waitForTimeout(800)

  const sample = await api(page, "/api/sample", { method: "POST", body: "{}" })
  const project = sample.project || sample
  const snapshots = await api(
    page,
    `/api/snapshots?projectId=${encodeURIComponent(project.id)}&kind=episodes`,
  )
  const source = snapshots.snapshots[0]
  const episodes = Array.isArray(source.payload) ? source.payload : []

  const branchData = await api(
    page,
    `/api/projects/${encodeURIComponent(project.id)}/localization/branches`,
    {
      method: "POST",
      body: JSON.stringify({
        name: "English",
        baseSnapshotId: source.id,
        market: "US",
        locale: "en-US",
        sourceLanguage: "zh-CN",
      }),
    },
  )
  const branch = branchData.branch

  await api(
    page,
    `/api/projects/${encodeURIComponent(project.id)}/localization/branches/${encodeURIComponent(branch.id)}/context`,
    {
      method: "PUT",
      body: JSON.stringify({
        marketCode: "en-US",
        platforms: ["TikTok", "ReelShort", "DramaBox"],
        contentRating: "PG-13",
        adaptationBrief: {
          audience: "North American women 25-35",
          emotion: "restrained but high-stakes",
          strategy: "Keep the causal chain and hook, rewrite cultural references and forms of address.",
          redlines: ["No underage romance", "No unexplained supernatural solution"],
        },
        subtitle: {
          maxLineChars: 42,
          maxCps: 17,
          minDurationMs: 1000,
          maxDurationMs: 7000,
        },
      }),
    },
  )
  await api(
    page,
    `/api/projects/${encodeURIComponent(project.id)}/localization/branches/${encodeURIComponent(branch.id)}/glossary`,
    {
      method: "PUT",
      body: JSON.stringify({
        source: "陈默",
        target: "Chen Mo",
        kind: "person",
        locked: true,
        notes: "主角统一译名",
      }),
    },
  )

  const localizedItems = episodes.slice(0, 4).map((episode, index) => ({
    episode: Number(episode.number),
    title: `Episode ${episode.number}: The Last Delivery`,
    localized: index === 0
      ? "Chen Mo accepts one final delivery, only to learn the recipient has been dead for seven years."
      : `Chen Mo follows the next clue and discovers a new cost behind the inheritance. Episode ${episode.number}.`,
    hook: index === 0
      ? "The signature belongs to Chen Mo himself."
      : "Another client already knows the next move.",
    source: String(episode.synopsis || ""),
    reason: "Keep the hook and shorten exposition for vertical subtitles.",
    glossaryUsed: ["陈默"],
    risks: index === 1 ? ["Old newspaper signage should be replaced in post."] : [],
  }))

  await api(
    page,
    `/api/projects/${encodeURIComponent(project.id)}/localization/branches/${encodeURIComponent(branch.id)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify({ sourceSnapshotId: source.id, items: localizedItems }),
    },
  )
  await api(
    page,
    `/api/projects/${encodeURIComponent(project.id)}/localization/branches/${encodeURIComponent(branch.id)}/audit`,
    {
      method: "POST",
      body: JSON.stringify({ sourceSnapshotId: source.id, items: localizedItems }),
    },
  )

  const url = `${baseURL}/localize/${encodeURIComponent(project.id)}?branch=${encodeURIComponent(branch.id)}`
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
  await page.getByRole("heading", { name: "目标市场与改编约束" }).waitFor({
    state: "visible",
    timeout: 30_000,
  })
  await page.waitForTimeout(800)
  const desktopOverflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  if (desktopOverflow.scroll > desktopOverflow.width + 2) {
    throw new Error(`desktop localization overflow ${JSON.stringify(desktopOverflow)}`)
  }
  await page.screenshot({ path: path.join(outputDir, "localize-desktop-market.png") })

  await page.getByRole("button", { name: /改编方案/ }).click()
  await page.getByRole("heading", { name: "生成本地化候选" }).waitFor({
    state: "visible",
    timeout: 10_000,
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outputDir, "localize-desktop-adapt.png") })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
  await page.getByRole("heading", { name: "目标市场与改编约束" }).waitFor({
    state: "visible",
    timeout: 30_000,
  })
  await page.waitForTimeout(800)
  const mobileOverflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  if (mobileOverflow.scroll > mobileOverflow.width + 2) {
    throw new Error(`mobile localization overflow ${JSON.stringify(mobileOverflow)}`)
  }
  await page.screenshot({ path: path.join(outputDir, "localize-mobile-market.png") })

  console.log(JSON.stringify({
    projectId: project.id,
    branchId: branch.id,
    url,
    screenshots: [
      "localize-desktop-market.png",
      "localize-desktop-adapt.png",
      "localize-mobile-market.png",
    ],
  }, null, 2))
} finally {
  await browser.close()
}
