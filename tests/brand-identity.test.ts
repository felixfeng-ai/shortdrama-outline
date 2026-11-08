import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".webmanifest",
])

function listTextFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...listTextFiles(target))
      continue
    }
    if (TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(target)
  }
  return files
}

test("BRAND1 使用 VeyaTV · 成剧 与生产平台定位", () => {
  const design = fs.readFileSync("DESIGN.md", "utf8")
  const readme = fs.readFileSync("README.md", "utf8")
  const guide = fs.readFileSync("docs/brand-guidelines.md", "utf8")
  const layout = fs.readFileSync("app/layout.tsx", "utf8")
  const pwa = fs.readFileSync("lib/pwa.ts", "utf8")

  for (const content of [design, readme, guide]) {
    assert.match(content, /VeyaTV/)
    assert.match(content, /成剧/)
    assert.match(content, /AI 短剧与漫剧生产平台/)
  }
  assert.match(layout, /VeyaTV/)
  assert.match(layout, /AI 短剧与漫剧生产平台/)
  assert.match(guide, /Veya Agent/)
  assert.match(guide, /Veya Canvas/)
  assert.match(guide, /veyatv\.com/)
  assert.match(guide, /chenju\.work/)
  assert.match(layout, /title:\s*'VeyaTV · AI 短剧与漫剧生产平台'/)
  assert.match(pwa, /name:\s*"VeyaTV · 成剧"/)
  assert.match(pwa, /short_name:\s*"VeyaTV"/)
})

test("BRAND2 当前产品、文档和规范不再残留旧品牌", () => {
  const roots = ["app", "components", "lib", "public", "docs", "specs"]
  const files = [
    ...roots.flatMap((root) => listTextFiles(root)),
    "README.md",
    "DESIGN.md",
    "APP.md",
    "COMPETITION.md",
  ].filter((file) => (
    fs.existsSync(file)
    && file !== "DESIGN.md"
    && file !== path.join("docs", "brand-guidelines.md")
  ))

  const offenders = files.filter((file) => {
    const content = fs.readFileSync(file, "utf8")
    return /VeyaFrame|VEYAFRAME|成剧 VeyaFrame/.test(content)
  })

  assert.deepEqual(offenders, [], `旧品牌仍有残留：${offenders.join(", ")}`)
})
