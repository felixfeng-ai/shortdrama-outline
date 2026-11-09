import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const layout = fs.readFileSync("app/layout.tsx", "utf8")
const globals = fs.readFileSync("app/globals.css", "utf8")
const workspace = fs.readFileSync("app/workspace-shell.css", "utf8")
const skills = fs.readFileSync("app/skills/skills.css", "utf8")

test("TYPOGRAPHY1 产品界面使用 Inter 与系统中文字体栈", () => {
  assert.match(layout, /inter-latin-variable\.woff2/)
  assert.match(layout, /variable: '--font-latin'/)
  assert.match(globals, /--font-ui: var\(--font-latin\), -apple-system/)
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

test("TYPOGRAPHY3 技能页不再单独使用展示字体作为正文或等宽字体", () => {
  assert.match(skills, /--font-ui: var\(--font-latin\), -apple-system/)
  assert.match(skills, /--font-mono: var\(--font-code\), ui-monospace/)
  assert.doesNotMatch(skills, /--font-ui: var\(--font-latin\);/)
  assert.doesNotMatch(skills, /--font-mono: var\(--font-latin\);/)
})
