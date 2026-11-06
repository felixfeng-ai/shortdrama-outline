import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("N1/N2 工作台以创作表示模式，技能库继续使用完整名称", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const sidebar = fs.readFileSync("components/WorkspaceSidebar.tsx", "utf8")
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  const route = fs.readFileSync("app/skills/page.tsx", "utf8")

  assert.match(sidebar, /创作技能/)
  assert.match(page, /openWorkspaceMode\('create'\)/)
  assert.match(catalog, /创作技能库/)
  assert.match(catalog, /搜索创作技能/)
  assert.doesNotMatch(catalog, /<span>Skill<\/span>/)
  assert.match(route, /创作技能/)
})

test("V1-V3 第 6 步提供分镜、镜头视频和时间线成片三个页签", () => {
  const shots = fs.readFileSync("components/ShotList.tsx", "utf8")
  assert.match(shots, /shot-workspace-tabs/)
  assert.match(shots, />分镜</)
  assert.match(shots, />镜头视频</)
  assert.match(shots, />时间线成片</)
  assert.match(shots, /workspaceMode === 'video'/)
  assert.match(shots, /workspaceMode === 'timeline'/)
})

test("C1/C2 登录页突出短剧生产链、跨镜一致性与版本连续性", () => {
  const layout = fs.readFileSync("app/layout.tsx", "utf8")
  const login = fs.readFileSync("components/LoginPanel.tsx", "utf8")

  assert.match(layout, /镜头视频/)
  assert.match(layout, /成片/)
  assert.match(login, /短剧创作工作台/)
  assert.match(login, /回来接着写/)
  assert.match(login, /把下一场做成/)
  assert.match(login, /人物、分集、场次、分镜和首帧/)
  assert.match(login, /人物跨镜不走样/)
  assert.match(login, /每次修改可回看/)
})
