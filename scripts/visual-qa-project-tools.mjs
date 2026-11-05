import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseURL = process.env.VISUAL_QA_URL || 'http://localhost:3216'
const outputDir = path.resolve('.tmp-visual-qa', 'project-tools')
fs.mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})

async function createSampleProject(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/sample', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || 'sample failed')
    return payload.data.project ?? payload.data
  })
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`))

  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  const project = await createSampleProject(page)
  await page.goto(
    `${baseURL}/?project=${encodeURIComponent(project.id)}&step=characters`,
    { waitUntil: 'networkidle', timeout: 30_000 },
  )

  const trigger = page.getByRole('button', { name: '打开项目工具' })
  await trigger.waitFor({ state: 'visible', timeout: 20_000 })
  if (await page.locator('.project-tools-dialog').count() !== 0) {
    throw new Error('project tools content is mounted before opening')
  }
  await page.screenshot({
    path: path.join(outputDir, 'workbench-without-tools-desktop.png'),
    fullPage: false,
  })

  await trigger.click()
  const dialog = page.locator('.project-tools-dialog')
  await dialog.waitFor({ state: 'visible', timeout: 10_000 })
  const tabs = page.locator('.project-tools-tab')
  if (await tabs.count() !== 3) throw new Error('project tools tabs are incomplete')
  const tabCopy = await tabs.allTextContents()
  for (const expected of ['实体批注', '跨项目资产', '版本分支']) {
    if (!tabCopy.some((text) => text.includes(expected))) {
      throw new Error(`missing tool explanation: ${expected}`)
    }
  }
  await page.screenshot({
    path: path.join(outputDir, 'project-tools-comments-desktop.png'),
    fullPage: false,
  })

  await tabs.filter({ hasText: '跨项目资产' }).click()
  await page.getByRole('heading', { name: '跨项目资产库' }).waitFor({ timeout: 5_000 })
  await tabs.filter({ hasText: '版本分支' }).click()
  await page.getByRole('heading', { name: '版本分支' }).waitFor({ timeout: 5_000 })
  await page.getByRole('button', { name: '关闭项目工具' }).click()
  await dialog.waitFor({ state: 'detached', timeout: 5_000 })
  if (await page.locator('.project-tools-dialog').count() !== 0) {
    throw new Error('project tools were not unmounted after close')
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(
    `${baseURL}/?project=${encodeURIComponent(project.id)}&step=characters`,
    { waitUntil: 'networkidle', timeout: 30_000 },
  )
  await mobilePage.getByRole('button', { name: '打开项目工具' }).click()
  await mobilePage.locator('.project-tools-dialog').waitFor({ state: 'visible', timeout: 10_000 })
  const overflow = await mobilePage.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (overflow.scrollWidth > overflow.width + 2) {
    throw new Error(`mobile overflow ${JSON.stringify(overflow)}`)
  }
  const closeBox = await mobilePage.getByRole('button', { name: '关闭项目工具' }).boundingBox()
  if (!closeBox || closeBox.width < 44 || closeBox.height < 44) {
    throw new Error(`mobile close target below 44px: ${JSON.stringify(closeBox)}`)
  }
  await mobilePage.screenshot({
    path: path.join(outputDir, 'project-tools-mobile.png'),
    fullPage: false,
  })

  if (errors.length > 0) throw new Error(`console errors: ${errors.join(' | ')}`)
  console.log(JSON.stringify({
    projectId: project.id,
    tabCopy,
    overflow,
    closeBox,
    screenshots: outputDir,
  }, null, 2))
} finally {
  await browser.close()
}
