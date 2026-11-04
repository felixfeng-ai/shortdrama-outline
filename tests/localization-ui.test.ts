import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("LUI1 本地化工作区包含七个步骤、分支切换和确认边界", () => {
  const page = fs.readFileSync("app/localize/[projectId]/page.tsx", "utf8")
  for (const label of ["市场设定", "改编方案", "剧本对照", "术语与 Canon", "字幕与配音", "视觉本地化", "质检与交付"]) {
    assert.match(page, new RegExp(label))
  }
  assert.match(page, /创建海外分支/)
  assert.match(page, /原始版本未改变/)
  assert.match(page, /尚未写入正式版本/)
  assert.match(page, /AgentDock/)
})

test("LUI2 项目条有海外版入口，窄屏布局不使用横向滚动", () => {
  const projectBar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  const css = fs.readFileSync("app/localize/localize.css", "utf8")
  assert.match(projectBar, /\/localize\//)
  assert.match(projectBar, /海外版/)
  assert.match(css, /@media \(max-width: 640px\)/)
  assert.match(css, /\.localize-layout \{\s*display: block;/)
  assert.doesNotMatch(css, /overflow-x:\s*scroll;[\s\S]*?localize-content/)
})
