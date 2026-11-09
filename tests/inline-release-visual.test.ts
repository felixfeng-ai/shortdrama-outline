import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const notice = fs.readFileSync("components/InlineReleaseNotice.tsx", "utf8")
const shellCss = fs.readFileSync("app/workspace-shell.css", "utf8")

test("公告使用内测状态信号、价值摘要和单一主操作", () => {
  assert.match(notice, /inline-release-orbit/)
  assert.match(notice, /LATEST_PRODUCT_RELEASE\.status/)
  assert.match(notice, /LATEST_PRODUCT_RELEASE\.summary/)
  assert.match(notice, /inline-release-action/)
  assert.match(notice, /aria-haspopup="dialog"/)
  assert.match(notice, /ReleaseDetailsDialog/)
  assert.doesNotMatch(notice, /SmoothCollapse/)
  assert.doesNotMatch(notice, /className="inline-release-bar"[\s\S]*<b>\{LATEST_PRODUCT_RELEASE\.version\}<\/b>/)
})

test("公告内部有克制的冷蓝氛围光和可关闭的运行脉冲", () => {
  assert.match(shellCss, /\.wfx-content \.inline-release-bar::before\s*\{[^}]*radial-gradient/s)
  assert.match(shellCss, /\.inline-release-orbit::after\s*\{[^}]*animation:/s)
  assert.match(shellCss, /@keyframes inline-release-pulse/)
  assert.match(shellCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.inline-release-orbit::after/)
})
