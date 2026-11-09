import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("RELEASE-DIALOG1 announcement details open in an accessible modal", () => {
  const dialogPath = "components/ReleaseDetailsDialog.tsx"
  assert.ok(fs.existsSync(dialogPath), "缺少统一公告详情弹框")

  const dialog = fs.readFileSync(dialogPath, "utf8")
  const inline = fs.readFileSync("components/InlineReleaseNotice.tsx", "utf8")
  const topbar = fs.readFileSync("components/ReleaseNotice.tsx", "utf8")
  const globalCss = fs.readFileSync("app/globals.css", "utf8")

  assert.match(dialog, /role="dialog"/)
  assert.match(dialog, /aria-modal="true"/)
  assert.match(dialog, /event\.key === ['"]Escape['"]/)
  assert.match(dialog, /event\.key !== ['"]Tab['"]/)
  assert.match(dialog, /previousFocus/)
  assert.match(dialog, /document\.body\.style\.overflow/)
  assert.match(dialog, /ReleaseDetailsDialog/)
  assert.match(
    globalCss,
    /\.release-dialog-scrim\s*\{[^}]*overscroll-behavior:\s*contain/s,
  )

  assert.match(inline, /ReleaseDetailsDialog/)
  assert.doesNotMatch(inline, /SmoothCollapse/)
  assert.match(inline, /aria-haspopup="dialog"/)
  assert.match(topbar, /ReleaseDetailsDialog/)
  assert.doesNotMatch(topbar, /SmoothCollapse/)
})
