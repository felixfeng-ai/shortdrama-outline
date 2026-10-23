import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { PWA_MANIFEST } from "../lib/pwa.ts"

test("P1.1 Manifest 具备安装所需字段和 SVG 图标", () => {
  assert.equal(PWA_MANIFEST.name, "成剧 VeyaFrame")
  assert.equal(PWA_MANIFEST.short_name, "成剧")
  assert.equal(PWA_MANIFEST.start_url, "/")
  assert.equal(PWA_MANIFEST.display, "standalone")
  assert.equal(PWA_MANIFEST.background_color, "#13171A")
  assert.equal(PWA_MANIFEST.theme_color, "#13171A")
  assert.ok(PWA_MANIFEST.icons.some((icon) => icon.type === "image/svg+xml"))
  assert.equal(fs.existsSync("public/manifest.webmanifest"), false, "旧静态清单会覆盖 App Router Manifest")
})

test("P2 顶栏安装按钮只在 beforeinstallprompt 可用时出现，并注册 Service Worker", () => {
  const source = fs.readFileSync("components/PwaInstallButton.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(source.includes("beforeinstallprompt"), "缺少浏览器安装事件")
  assert.ok(source.includes("priorInstallPrompt.prompt()"), "没有调用安装提示")
  assert.ok(source.includes("serviceWorker.register('/sw.js')"), "没有注册 Service Worker")
  assert.ok(source.includes("安装应用"), "缺少安装文案")
  assert.ok(page.includes("<PwaInstallButton"), "顶栏没有安装入口")
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
