import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const page = fs.readFileSync("app/page.tsx", "utf8")
const css = fs.readFileSync("app/globals.css", "utf8")

test("A1-A2 桌面 Agent 默认收起并提供图标与未读角标", () => {
  assert.match(page, /h-agent-fab/)
  assert.match(page, /h-agent-fab-face/)
  assert.match(page, /aria-expanded=\{deckOpen\}/)
  assert.match(page, /aria-controls="veye-deck"/)
  assert.match(page, /id="veye-deck"/)
  assert.match(page, /agentUnread > 9/)
})

test("A3 侧舱以浮层展开，不再参与主工作区宽度分配", () => {
  assert.match(css, /@media \(min-width: 921px\)/)
  assert.match(css, /\.signal-desk \.h-deck\s*\{[\s\S]*?position: fixed/)
  assert.match(css, /\.signal-desk \.h-deck\s*\{[\s\S]*?visibility: hidden/)
  assert.match(css, /\.signal-desk \.h-deck\.open\s*\{/)
  assert.match(css, /transform: translateX\(calc\(100% \+ 24px\)\)/)
  assert.match(css, /\.signal-desk \.h-agent-fab/)
})

test("A4-A5 再点或 Escape 收起，并支持 reduced-motion", () => {
  assert.match(page, /if \(e\.key === 'Escape'\)[\s\S]*?setDeckOpen\(false\)/)
  assert.match(page, /setDeckOpen\(\(v\) => !v\)/)
  assert.match(page, /deckOpen[\s\S]*?'收起 Veya Agent'[\s\S]*?'打开 Veya Agent'/)
  assert.match(css, /prefers-reduced-motion/)
})

test("A6 移动端隐藏悬浮图标，保留底部抽屉抓手", () => {
  assert.match(page, /h-deck-grab/)
  assert.match(css, /@media \(max-width: 920px\)[\s\S]*?\.signal-desk \.h-agent-fab\s*\{\s*display: none;/)
})
