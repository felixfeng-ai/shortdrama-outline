import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("内测下载页覆盖 Android、iOS、安装步骤和示例项目", () => {
  const page = fs.readFileSync("app/app/page.tsx", "utf8")
  const css = fs.readFileSync("app/app/app-download.css", "utf8")

  for (const text of ["Android", "iOS", "安装内测包", "示例项目", "内测反馈"]) {
    assert.ok(page.includes(text), `下载页缺少 ${text}`)
  }
  assert.match(page, /app-download-hero-actions/)
  assert.match(page, /下载 Android 内测包/)
  assert.match(page, /robots/)
  assert.match(page, /index:\s*false/)
  assert.match(page, /follow:\s*false/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /@media \(max-width: 760px\)/)
})
