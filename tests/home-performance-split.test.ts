import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("首页重工作台模块使用动态加载，不进入默认首包", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const dynamicModules = [
    "AgentDock",
    "CanvasGraphWorkspace",
    "ProductionCanvas",
    "SkillCatalog",
    "ShotInspector",
    "ShotPreviewDock",
  ]

  assert.match(page, /from ['"]next\/dynamic['"]/)
  for (const name of dynamicModules) {
    assert.match(
      page,
      new RegExp(`dynamic\\([\\s\\S]{0,180}import\\(['"]@/components/${name}['"]\\)`),
      `${name} 仍未按需加载`,
    )
    assert.doesNotMatch(
      page,
      new RegExp(`import\\s+${name}\\s+from\\s+['"]@/components/${name}['"]`),
      `${name} 仍在首页静态导入`,
    )
  }
  assert.match(page, /ssr:\s*false/)
  assert.match(page, /agentDeckMounted/)
  assert.match(page, /wfx-lazy-module/)
})
