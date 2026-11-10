import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const layout = fs.readFileSync("app/layout.tsx", "utf8")
const globals = fs.readFileSync("app/globals.css", "utf8")
const workspace = fs.readFileSync("app/workspace-shell.css", "utf8")
const skills = fs.readFileSync("app/skills/skills.css", "utf8")
const docs = fs.readFileSync("app/docs/docs.css", "utf8")
const legal = fs.readFileSync("app/legal/legal.css", "utf8")
const novels = fs.readFileSync("app/novels/novel.css", "utf8")
const localize = fs.readFileSync("app/localize/localize.css", "utf8")
const storyboard = fs.readFileSync("app/storyboard/storyboard.css", "utf8")
const appDownload = fs.readFileSync("app/app/app-download.css", "utf8")

test("TYPOGRAPHY1 产品界面使用中文字体栈优先，Inter 负责拉丁与数字", () => {
  assert.match(layout, /inter-latin-variable\.woff2/)
  assert.match(layout, /variable: '--font-latin'/)
  assert.match(
    globals,
    /--font-cjk: "PingFang SC", "Noto Sans SC", "Microsoft YaHei"/,
  )
  assert.match(
    globals,
    /--font-ui: var\(--font-cjk\), var\(--font-latin\), sans-serif/,
  )
  assert.match(globals, /"PingFang SC"/)
  assert.match(globals, /"Microsoft YaHei"/)
  assert.ok(fs.existsSync("app/fonts/inter-latin-variable.woff2"))
  assert.ok(fs.existsSync("app/fonts/Inter-OFL.txt"))
})

test("TYPOGRAPHY2 工作区修正等宽字体覆盖并统一标题字重", () => {
  assert.match(workspace, /font-family: var\(--font-ui\)/)
  assert.match(workspace, /--font-mono: var\(--font-code\), ui-monospace/)
  assert.match(workspace, /\.wfx-workspace :is\(h1, h2, h3, h4\)/)
  assert.match(workspace, /\.wfx-workspace :is\(h2, h3, h4\) \{\s*font-weight: 600;/)
  assert.doesNotMatch(workspace, /--font-mono: var\(--font-latin\)/)
})

test("TYPOGRAPHY3 技能页保持中文优先，且不再单独使用展示字体作为正文或等宽字体", () => {
  assert.match(
    skills,
    /--font-ui: "PingFang SC", "Noto Sans SC", "Microsoft YaHei"/,
  )
  assert.match(skills, /--font-mono: var\(--font-code\), ui-monospace/)
  assert.doesNotMatch(skills, /--font-ui: var\(--font-latin\);/)
  assert.doesNotMatch(skills, /--font-mono: var\(--font-latin\);/)
})

test("TYPOGRAPHY4 全部用户页面继承同一中文优先字体系统", () => {
  assert.match(docs, /\.docs-page\s*\{[^}]*font-family:\s*var\(--font-ui\);/s)
  assert.match(legal, /\.legal-page\s*\{[^}]*font-family:\s*var\(--font-ui\);/s)
  assert.match(novels, /\.novel-page\s*\{[^}]*font-family:\s*var\(--font-ui\);/s)
  assert.match(localize, /\.localize-page\s*\{[^}]*font-family:\s*var\(--font-ui\);/s)
  assert.match(storyboard, /\.storyboard-shell\s*\{[^}]*font-family:\s*var\(--font-ui\);/s)
  assert.match(appDownload, /\.app-download-page\s*\{[^}]*font-family:\s*var\(--font-ui\);/s)
  assert.match(workspace, /\.auth-page,\s*\.delivery-shell,\s*\.review-shell/)
  assert.match(
    globals,
    /html\[data-theme="h-deck"\]\[lang="zh-CN"\] body :is\(h1, h2, h3, h4, h5, h6\)/,
  )
  assert.match(globals, /\[class~="text-\[9px\]"\]/)
  assert.match(globals, /\[class~="text-\[10\.5px\]"\]/)
})

test("TYPOGRAPHY5 全站不再使用低于 11px 的正文和中间合成字重", () => {
  const surfaces = [globals, workspace, skills, docs, legal, novels, localize, storyboard, appDownload]
  for (const css of surfaces) {
    assert.doesNotMatch(css, /font-size:\s*(?:[0-9](?:\.\d+)?|10(?:\.\d+)?)px/)
    assert.doesNotMatch(
      css,
      /font-weight:\s*(?:450|520|540|550|560|570|580|590|610|620|630|640|650|660)\b/,
    )
  }
})
