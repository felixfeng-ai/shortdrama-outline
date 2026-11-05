import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("根布局由服务端直接输出固定主题，不再渲染内联 script", () => {
  const layout = fs.readFileSync("app/layout.tsx", "utf8")
  const theme = fs.readFileSync("lib/theme.ts", "utf8")

  assert.ok(layout.includes('data-theme="h-deck"'), "根节点没有在首屏输出固定主题")
  assert.ok(!layout.includes("<script"), "根布局仍包含会导致 React 报错的内联 script")
  assert.ok(!layout.includes("THEME_BOOTSTRAP"), "根布局仍依赖冗余的主题 bootstrap")
  assert.ok(theme.includes("return DEFAULT_THEME"), "主题解析不再固定为服务端默认主题")
})
