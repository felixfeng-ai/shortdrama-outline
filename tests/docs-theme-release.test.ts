import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("DOCS-THEME1 tutorial matches the workspace palette and documents release details", () => {
  const guide = fs.readFileSync("components/DocsGuide.tsx", "utf8")
  const css = fs.readFileSync("app/docs/docs.css", "utf8")

  assert.match(css, /--docs-canvas:\s*#08090a/i)
  assert.match(css, /--docs-surface:\s*#101214/i)
  assert.match(css, /--docs-raised:\s*#15181a/i)
  assert.match(css, /--docs-accent:\s*#8dc8dc/i)
  assert.match(css, /--docs-primary:\s*#f2f2ee/i)
  assert.match(css, /background:\s*var\(--docs-canvas\)/i)

  assert.match(guide, /\['release-notes',\s*'平台公告与版本'\]/)
  assert.match(guide, /id="release-notes"/)
  assert.match(guide, /点击“查看详情”打开公告弹框/)
  assert.match(guide, /版本号、发布时间和本次更新内容/)
})

test("DOCS-POSITION1 tutorial hero makes controllable production the differentiator", () => {
  const guide = fs.readFileSync("components/DocsGuide.tsx", "utf8")
  const css = fs.readFileSync("app/docs/docs.css", "utf8")

  assert.match(guide, /一句话直接出片/)
  assert.match(guide, /六步逐段确认/)
  assert.match(guide, /人物 Canon 不断链/)
  assert.match(guide, /返工成本可追溯/)
  assert.match(guide, /docs-difference-rail/)
  assert.match(css, /\.docs-difference-rail\s*\{/)
})
