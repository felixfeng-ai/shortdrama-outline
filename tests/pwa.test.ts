import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { PWA_MANIFEST } from "../lib/pwa.ts"

test("P1.1 Manifest 具备安装所需字段和 SVG 图标", () => {
  assert.equal(PWA_MANIFEST.name, "VeyaTV")
  assert.equal(PWA_MANIFEST.short_name, "VeyaTV")
  assert.equal(PWA_MANIFEST.start_url, "/")
  assert.equal(PWA_MANIFEST.display, "standalone")
  assert.equal(PWA_MANIFEST.background_color, "#08090A")
  assert.equal(PWA_MANIFEST.theme_color, "#08090A")
  assert.ok(PWA_MANIFEST.icons.some((icon) => icon.type === "image/svg+xml"))
  assert.ok(PWA_MANIFEST.icons.every((icon) => icon.src === "/veyatv-icon.svg"))
  assert.equal(fs.existsSync("public/manifest.webmanifest"), false, "旧静态清单会覆盖 App Router Manifest")
})

test("P2 顶栏安装按钮只在 beforeinstallprompt 可用时出现，并注册 Service Worker", () => {
  const source = fs.readFileSync("components/PwaInstallButton.tsx", "utf8")
  const topbar = fs.readFileSync("components/WorkspaceTopbar.tsx", "utf8")
  assert.ok(source.includes("beforeinstallprompt"), "缺少浏览器安装事件")
  assert.ok(source.includes("priorInstallPrompt.prompt()"), "没有调用安装提示")
  assert.ok(source.includes("serviceWorker.register('/sw.js')"), "没有注册 Service Worker")
  assert.ok(source.includes("setInstallTarget(mobileQuery.matches ? '主屏' : '桌面')"), "安装文案没有区分桌面与主屏")
  assert.ok(source.includes("添加到{installTarget}"), "缺少设备自适应的添加文案")
  assert.ok(!source.includes(">安装应用<"), "按钮仍使用容易误解为安装包的旧文案")
  assert.ok(topbar.includes("<PwaInstallButton"), "顶栏更多菜单没有安装入口")
})

test("P3/P4 Service Worker 提供离线页、缓存静态资源且绕过 API 与图片", () => {
  const sw = fs.readFileSync("public/sw.js", "utf8")
  const offline = fs.readFileSync("public/offline.html", "utf8")
  assert.ok(sw.includes("/offline.html"), "缺少离线兜底")
  assert.ok(sw.includes("pathname.startsWith(\"/api/\")"), "API 没有被排除")
  assert.ok(sw.includes("request.mode === \"navigate\""), "没有区分导航请求")
  assert.ok(sw.includes("caches.match"), "没有读取缓存")
  assert.ok(offline.includes("需要联网"), "离线页没有说明")
  assert.equal(/https?:\/\//.test(offline.replace(/https:\/\/chenju\.work/g, "")), false, "离线页含外部依赖")
})

test("P5 开发环境清理旧 Service Worker，Next 静态块使用网络优先", () => {
  const source = fs.readFileSync("components/PwaInstallButton.tsx", "utf8")
  const sw = fs.readFileSync("public/sw.js", "utf8")

  assert.match(source, /process\.env\.NODE_ENV === 'production'/)
  assert.match(source, /getRegistrations\(\)/)
  assert.match(source, /\.unregister\(\)/)
  assert.match(sw, /chengju-shell-v5/)
  assert.match(sw, /url\.pathname\.startsWith\('\/_next\/static\/'\)[\s\S]{0,500}event\.respondWith\([\s\S]{0,300}fetch\(request\)/)
})
