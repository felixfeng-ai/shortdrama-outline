import { spawn } from "node:child_process"
import fs from "node:fs"
import { mkdir, mkdtemp } from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "playwright-core"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const evidenceDir = path.join(repoRoot, ".artifacts", "vault-recovery-e2e")
await mkdir(evidenceDir, { recursive: true })

const MOCK_KEY = "__veyaframe_vault_mock"
const SESSION_VALUE = "anon_local_development_session_0000000000000000"

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

async function waitForUrl(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`服务未在 ${timeoutMs}ms 内就绪：${url}`)
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

async function patchVaultMock(page, patch) {
  await page.evaluate(({ key, next }) => {
    const current = JSON.parse(sessionStorage.getItem(key) ?? "{}")
    sessionStorage.setItem(key, JSON.stringify({ ...current, ...next }))
  }, { key: MOCK_KEY, next: patch })
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "veyaframe-vault-e2e-"))
const port = await freePort()
const baseUrl = `http://127.0.0.1:${port}`
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
let serverLogs = ""
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    CHENGJU_DATA_DIR: path.join(tempDir, "data"),
    CHENGJU_GENERATED_DIR: path.join(tempDir, "generated"),
    AUTH_ALLOW_DEV_CODE: "0",
    TTS_ENABLED: "0",
    VIDEO_GENERATION_ENABLED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
})
server.stdout.on("data", (chunk) => {
  serverLogs += chunk.toString()
})
server.stderr.on("data", (chunk) => {
  serverLogs += chunk.toString()
})

let browser
let page
let refApiResponses = []
try {
  await waitForUrl(`${baseUrl}/api/health`)
  const executablePath = chromeExecutable()
  if (!executablePath) {
    throw new Error("没有可用的 Chromium/Chrome；请设置 CHROME_PATH 或安装 Playwright Chromium")
  }

  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  })
  await context.addCookies([{
    name: "chengju_sid",
    value: SESSION_VALUE,
    domain: new URL(baseUrl).hostname,
    path: "/",
  }])

  /**
   * 浏览器原生目录选择器无法由 Playwright 点击，因此只替身系统级目录 API。
   * 应用内部状态、授权按钮和扫描逻辑都仍走真实页面，不在测试里直接改 React state。
   */
  await context.addInitScript(({ key }) => {
    const defaults = {
      connected: false,
      query: "granted",
      request: "granted",
      files: ["陈默-定妆.png"],
      requestCalls: 0,
      missing: false,
    }
    const readState = () => ({
      ...defaults,
      ...JSON.parse(sessionStorage.getItem(key) ?? "{}"),
    })
    const writeState = (next) => sessionStorage.setItem(key, JSON.stringify(next))
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
      (char) => char.charCodeAt(0),
    )

    const createHandle = () => {
      const state = readState()
      const files = new Map(
        state.files.map((name) => [
          name,
          {
            kind: "file",
            name,
            getFile: async () => new File([png], name, { type: "image/png" }),
          },
        ]),
      )
      return {
        kind: "directory",
        name: "验收素材目录",
        queryPermission: async () => {
          if (state.missing) throw new DOMException("missing", "NotFoundError")
          if (state.query === "denied") return "denied"
          if (state.query === "prompt") return "prompt"
          return "granted"
        },
        requestPermission: async () => {
          const latest = readState()
          latest.requestCalls += 1
          writeState(latest)
          if (latest.request === "abort") throw new DOMException("cancelled", "AbortError")
          if (latest.request === "denied") throw new DOMException("denied", "NotAllowedError")
          return "granted"
        },
        values: async function* values() {
          const latest = readState()
          if (latest.missing) throw new DOMException("missing", "NotFoundError")
          for (const file of files.values()) yield file
        },
        getFileHandle: async (name) => {
          const latest = readState()
          if (latest.missing) throw new DOMException("missing", "NotFoundError")
          const file = new Map(
            latest.files.map((fileName) => [
              fileName,
              {
                kind: "file",
                name: fileName,
                getFile: async () => new File([png], fileName, { type: "image/png" }),
              },
            ]),
          ).get(name)
          if (!file) throw new DOMException("missing file", "NotFoundError")
          return file
        },
        getDirectoryHandle: async () => {
          throw new DOMException("missing directory", "NotFoundError")
        },
      }
    }

    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => createHandle(),
    })

    const nativeGet = IDBObjectStore.prototype.get
    const nativePut = IDBObjectStore.prototype.put
    const nativeDelete = IDBObjectStore.prototype.delete

    IDBObjectStore.prototype.get = function getPatched(...args) {
      if (this.name !== "handles") return nativeGet.apply(this, args)
      const state = readState()
      const request = { result: state.connected ? createHandle() : undefined, onsuccess: null, onerror: null }
      queueMicrotask(() => request.onsuccess?.())
      return request
    }
    IDBObjectStore.prototype.put = function putPatched(value, key) {
      if (this.name !== "handles") return nativePut.call(this, value, key)
      writeState({ ...readState(), connected: true })
      return nativePut.call(this, true, key)
    }
    IDBObjectStore.prototype.delete = function deletePatched(...args) {
      if (this.name === "handles") writeState({ ...readState(), connected: false })
      return nativeDelete.apply(this, args)
    }
  }, { key: MOCK_KEY })

  page = await context.newPage()
  const consoleErrors = []
  refApiResponses = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("response", async (response) => {
    if (!response.url().includes("/api/refs")) return
    refApiResponses.push({
      method: response.request().method(),
      status: response.status(),
    })
  })

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: /查看完整示例项目/ }).click()
  await page.waitForURL((url) => Boolean(url.searchParams.get("project")), { timeout: 30_000 })
  const projectId = new URL(page.url()).searchParams.get("project")
  if (!projectId) throw new Error("示例项目 URL 缺少 project")

  await page.goto(`${baseUrl}/?project=${projectId}&step=visuals`, {
    waitUntil: "domcontentloaded",
  })
  const vault = page.locator(".vault-panel-full")
  await vault.waitFor({ timeout: 30_000 })
  await vault.getByRole("button", { name: "选择素材文件夹" }).click()
  await vault.getByText("素材目录已连接").waitFor()
  await vault.getByText("1 张可读").waitFor()
  await page.getByRole("heading", { name: "图库匹配结果" }).waitFor({ timeout: 30_000 })
  await page.getByText(/已对上\s*1\s*张/).waitFor()
  await page.waitForFunction(async (pid) => {
    const response = await fetch(`/api/refs?projectId=${encodeURIComponent(pid)}`)
    const payload = await response.json()
    return payload?.data?.refs?.some((ref) => ref.vaultKey === "陈默-定妆.png") === true
  }, projectId, { timeout: 15_000 })

  await patchVaultMock(page, { query: "prompt", request: "abort" })
  await vault.getByRole("button", { name: "重新扫描" }).click()
  await vault.getByText("等待重新授权").waitFor()
  await vault.getByText("已保留 1 张").waitFor()
  await page.screenshot({
    path: path.join(evidenceDir, "vault-needs-permission-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })

  await patchVaultMock(page, { query: "prompt", request: "granted" })
  await vault.getByRole("button", { name: "重新授权素材文件夹" }).click()
  await vault.getByText("素材目录已连接").waitFor()
  await vault.getByText("1 张可读").waitFor()

  await patchVaultMock(page, {
    query: "granted",
    request: "granted",
    files: ["陈默-定妆-新.png"],
  })
  await vault.getByRole("button", { name: "重新扫描" }).click()
  await page.waitForFunction(async (pid) => {
    const response = await fetch(`/api/refs?projectId=${encodeURIComponent(pid)}`)
    const payload = await response.json()
    return payload?.data?.refs?.some((ref) => ref.vaultKey === "陈默-定妆-新.png") === true
  }, projectId, { timeout: 15_000 })
  await vault.getByText("已按文件指纹恢复 1 张引用").waitFor()
  await page.waitForFunction(() =>
    document.querySelector(".vault-panel-full")
      ?.getAttribute("data-unreadable-reference-count") === "0"
  )
  const persistedRefs = await page.evaluate(async (pid) => {
    const response = await fetch(`/api/refs?projectId=${encodeURIComponent(pid)}`)
    return response.json()
  }, projectId)
  if (
    !Array.isArray(persistedRefs?.data?.refs)
    || !persistedRefs.data.refs.some((ref) => ref.vaultKey === "陈默-定妆-新.png")
  ) {
    throw new Error("文件改名后没有把新 key 持久化到引用台账")
  }
  await page.screenshot({
    path: path.join(evidenceDir, "vault-hash-relink-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const relinkMobileOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  if (relinkMobileOverflow) throw new Error("390px 文件指纹恢复状态出现横向溢出")
  await page.locator(".vault-panel-full").scrollIntoViewIfNeeded()
  await page.locator(".vault-panel-full").screenshot({
    path: path.join(evidenceDir, "vault-hash-relink-mobile.png"),
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 1000 })

  await patchVaultMock(page, { query: "granted", request: "granted", files: [] })
  await vault.getByRole("button", { name: "重新扫描" }).click()
  await vault.getByText("图库中共 0 张图片").waitFor()
  await page.waitForFunction(() =>
    document.querySelector(".vault-panel-full")
      ?.getAttribute("data-unreadable-reference-count") === "1",
    undefined,
    { timeout: 10_000 },
  )
  await vault.getByText("1 张已挂引用暂时读不到").waitFor()
  await page.screenshot({
    path: path.join(evidenceDir, "vault-reference-warning-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })

  await patchVaultMock(page, {
    files: ["陈默-定妆-新.png"],
    query: "prompt",
    request: "granted",
  })
  const requestCallsBeforeReload = await page.evaluate((key) => {
    return JSON.parse(sessionStorage.getItem(key) ?? "{}").requestCalls
  }, MOCK_KEY)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.locator(".vault-panel-full").getByText("等待重新授权").waitFor()
  const requestCallsAfterReload = await page.evaluate((key) => {
    return JSON.parse(sessionStorage.getItem(key) ?? "{}").requestCalls
  }, MOCK_KEY)
  if (requestCallsAfterReload !== requestCallsBeforeReload) {
    throw new Error("启动恢复不应主动申请目录权限")
  }

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  if (mobileOverflow) throw new Error("390px 素材目录恢复状态出现横向溢出")
  await page.locator(".vault-panel-full").scrollIntoViewIfNeeded()
  await page.locator(".vault-panel-full").screenshot({
    path: path.join(evidenceDir, "vault-needs-permission-mobile.png"),
    animations: "disabled",
  })

  if (consoleErrors.length > 0) {
    throw new Error(`浏览器控制台错误：${consoleErrors.join(" | ")}`)
  }

  console.log(JSON.stringify({
    baseUrl,
    projectId,
    checked: [
      "选择目录后连接并读取 1 张本地图",
      "权限撤销后重新扫描不清空素材",
      "重新授权后恢复素材读取",
      "文件改名后按 hash 自动恢复并持久化新 key",
      "本地图删除后已挂引用告警",
      "刷新只查询权限且不主动申请",
      "390px 无横向溢出",
    ],
    screenshots: evidenceDir,
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ error: String(error), refApiResponses }, null, 2))
  fs.writeFileSync(path.join(evidenceDir, "server.log"), serverLogs)
  if (page) {
    await page.screenshot({
      path: path.join(evidenceDir, "vault-recovery-failure.png"),
      fullPage: true,
      animations: "disabled",
    }).catch(() => {})
  }
  throw error
} finally {
  if (browser) await browser.close()
  server.kill("SIGTERM")
}
