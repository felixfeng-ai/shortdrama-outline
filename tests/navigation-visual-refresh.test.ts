import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const page = fs.readFileSync("app/page.tsx", "utf8")
const css = fs.readFileSync("app/globals.css", "utf8")
const sideNav = fs.readFileSync("components/SideNav.tsx", "utf8")

test("N1 大屏快捷键移入侧栏，顶栏不再堆叠工作区按钮", () => {
  assert.match(page, /h-nav-utility/)
  assert.match(page, /signal-rail-utilities/)
  assert.match(css, /@media \(min-width: 1360px\)/)
  assert.match(css, /\.signal-desk \.h-top \.h-nav-utility/)
})

test("N2 顶栏按钮默认去掉硬描边，保留明确交互状态", () => {
  assert.match(css, /border-color: transparent/)
  assert.match(css, /\.signal-desk \.h-top :is\(/)
  assert.match(css, /\.h-top :is\([^)]*\):focus-visible/)
})

test("N3-N4 桌面侧栏显示完整导航和分组", () => {
  assert.match(page, /signal-rail-utilities/)
  assert.match(page, /signal-rail-brand/)
  assert.match(page, />创作技能</)
  assert.match(sideNav, /nav-section-divider/)
  assert.match(sideNav, /\{step\.nav\}/)
  assert.match(css, /\.signal-desk \.h-main > \.signal-rail/)
  assert.match(css, /width: 224px/)
  assert.match(css, /font-size: 15px/)
  assert.match(css, /\.signal-desk \.h-top \.h-lockup/)
  assert.match(css, /position: fixed/)
})

test("N5-N6 当前步骤使用浅填充，完成态只保留小圆点", () => {
  assert.match(css, /\.signal-desk \.signal-rail \.navpanel button\.on/)
  assert.match(css, /border-color: transparent/)
  assert.match(css, /background: rgba\(255, 255, 255, \.055\)/)
  assert.match(css, /button\.on::before/)
  assert.match(css, /button\.done::after/)
})

test("N6-N8 窄屏退回图标轨和顶部步骤胶囊", () => {
  assert.match(css, /@media \(max-width: 1359px\)/)
  assert.match(css, /@media \(max-width: 920px\)/)
  assert.match(css, /min-height: 44px/)
  assert.match(css, /\.signal-desk \.signal-rail-link:focus-visible/)
  assert.match(css, /prefers-reduced-motion/)
})
