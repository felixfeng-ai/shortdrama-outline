import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

function read(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
}

const topbar = read("components/WorkspaceTopbar.tsx")
const appDownload = read("components/AppDownloadDialog.tsx")
const page = read("app/page.tsx")
const footer = read("components/SiteLegalFooter.tsx")
const skillCatalog = read("components/SkillCatalog.tsx")
const skillsCss = read("app/skills/skills.css")
const shellCss = read("app/workspace-shell.css")
const appReleasePage = read("app/app/page.tsx")
const appReleaseApi = read("app/api/mobile/release/route.ts")
const androidDownloadRoute = read("app/app/download/android/route.ts")

test("WEP1 教程入口进入主菜单，并保留更多菜单备用入口", () => {
  const sidebar = read("components/WorkspaceSidebar.tsx")
  assert.match(sidebar, /href="\/docs"/)
  assert.match(sidebar, /使用教程/)
  assert.match(topbar, /href="\/docs"/)
  assert.doesNotMatch(topbar, /wfx-tutorial-entry/)
})

test("WEP2 手机 App 下载入口使用用户二维码原图并打开可访问弹层", () => {
  assert.match(topbar, /aria-label="下载手机 App"/)
  assert.match(topbar, /AppDownloadDialog/)
  assert.match(appDownload, /\/app-download-qr\.png/)
  assert.match(appDownload, /role="dialog"/)
  assert.match(appDownload, /aria-modal="true"/)
  assert.match(appDownload, /手机官方自带浏览器或微信扫一扫/)
  assert.match(appDownload, /目前仅支持安卓和鸿蒙手机/)
  assert.match(appDownload, /iOS 版本更新中/)
  assert.ok(fs.existsSync("public/app-download-qr.png"), "二维码原图必须进入 public 资产")
})

test("WEP3 当前画布保持不变，额外提供保留项目状态的新窗口入口", () => {
  assert.match(page, /function openCanvasWindow\(\)/)
  assert.match(page, /window\.open\(/)
  assert.match(page, /opened\.opener\s*=\s*null/)
  assert.match(page, /function openCanvasWindow\(\)[\s\S]*new URLSearchParams[\s\S]*\/canvas\?/)
  assert.doesNotMatch(page, /withWorkspaceModeQuery\(stepSearch, 'canvas'\)/)
  assert.match(page, /onOpenCanvas=\{\(\) => openCanvas\('graph'\)\}/)
  assert.match(page, /if \(mode === 'canvas'\)\s*\{\s*openCanvas\('graph'\)/s)
  assert.match(page, /在新窗口打开/)
})

test("WEP4 页脚只保留内测品牌，不暴露香港服务器", () => {
  assert.match(footer, /内测版/)
  assert.doesNotMatch(footer, /香港服务器/)
})

test("WEP5 问场记改为圆形图标，不再使用横向文字胶囊", () => {
  assert.match(skillCatalog, /className="agent-entry"[\s\S]*aria-label="问场记"/)
  assert.doesNotMatch(skillCatalog, /agent-entry-copy/)
  assert.doesNotMatch(skillCatalog, /选技能、查项目或直接开工/)
  assert.match(skillsCss, /\.skill-page \.agent-entry\s*\{[^}]*width:\s*56px;[^}]*height:\s*56px;[^}]*border-radius:\s*50%/s)
  assert.match(shellCss, /\.is-create-mode \.skill-page\.skill-page-embedded \.agent-entry\s*\{[^}]*bottom:\s*76px;/s)
})

test("WEP6 App 下载二维码指向稳定安装页，版本信息运行时读取", () => {
  assert.match(appDownload, /\/app\/download\/android/)
  assert.match(appDownload, /\/api\/mobile\/release/)
  assert.match(appReleasePage, /resolveRuntimeMobileRelease/)
  assert.match(appReleaseApi, /force-dynamic/)
  assert.match(appReleaseApi, /stableUrl/)
  assert.match(androidDownloadRoute, /NextResponse\.redirect/)
  assert.match(androidDownloadRoute, /resolveRuntimeMobileRelease/)
})
