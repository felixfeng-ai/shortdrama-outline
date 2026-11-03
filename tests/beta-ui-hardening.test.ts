import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("BETAUI1 无项目时提供创建入口，并禁用原文与空发送", () => {
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  assert.ok(catalog.includes("createProject"))
  assert.ok(catalog.includes("新建项目"))
  assert.match(catalog, /aria-label="添加项目原文"[\s\S]*disabled=\{!project|disabled=\{!project \|\| materialBusy\}/)
  assert.match(catalog, /className="send-button"[\s\S]*disabled=\{!project \|\| !prompt\.trim\(\)/)
})

test("BETAUI2 场记抽屉具备对话框语义、焦点陷阱和关闭后恢复", () => {
  const drawer = fs.readFileSync("components/SkillAgentDrawer.tsx", "utf8")
  assert.ok(drawer.includes('role="dialog"'))
  assert.ok(drawer.includes('aria-modal="true"'))
  assert.ok(drawer.includes("previousFocus"))
  assert.ok(drawer.includes("drawerRef"))
  assert.ok(drawer.includes("event.key === 'Tab'"))
  assert.ok(drawer.includes("previousFocus.current?.focus()"))
})

test("BETAUI3 手机端工具按钮保留可见文字，不再只显示图标", () => {
  const css = fs.readFileSync("app/skills/skills.css", "utf8")
  assert.ok(!css.includes(".skill-page .tool-button span { display: none; }"))
})
