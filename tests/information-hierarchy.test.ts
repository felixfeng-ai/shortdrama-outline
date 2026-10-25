import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

function read(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
}

const page = read("app/page.tsx")
const idea = read("components/IdeaPanel.tsx")
const projectBar = read("components/ProjectBar.tsx")

test("Story Command 只在核心人物完整展开，其他步骤用摘要", () => {
  assert.match(page, /<IdeaPanel[\s\S]*compact=\{view !== ['"]characters['"]\}/)
  assert.match(page, /allowGenerate=\{view === ['"]characters['"]\}/)
  assert.ok(idea.includes("项目源想法"))
  assert.ok(idea.includes("编辑想法"))
  assert.ok(idea.includes("下游内容可能需要重跑"))
})

test("本地图库仅在定妆和场景完整展示，分镜只保留缺图摘要", () => {
  assert.match(page, /view === ['"]visuals['"] \|\| view === ['"]scenes['"]/)
  assert.ok(page.includes("去定妆补图"))
  assert.ok(page.includes("compact"))
})

test("导出统一进入项目菜单，工作台底部不再重复导出卡片", () => {
  assert.ok(projectBar.includes("导出项目包"))
  assert.ok(projectBar.includes("导出 Markdown"))
  assert.ok(projectBar.includes("复制全部大纲"))
  assert.equal(page.includes(">打包带走<"), false)
  assert.equal(page.includes("导出项目包</button>"), false)
})

test("非人物步骤不显示生成核心人物主按钮", () => {
  assert.ok(idea.includes("allowGenerate"))
  assert.match(idea, /allowGenerate\s*&&/)
})
