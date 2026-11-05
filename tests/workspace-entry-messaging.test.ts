import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("N1/N2 主入口统一使用创作技能，不再只显示裸 Skill", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  const route = fs.readFileSync("app/skills/page.tsx", "utf8")

  assert.match(page, /创作技能/)
  assert.match(page, /signal-rail-skill/)
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

test("C1/C2 首页、元数据和登录页更新为故事到成片", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const layout = fs.readFileSync("app/layout.tsx", "utf8")
  const login = fs.readFileSync("components/LoginPanel.tsx", "utf8")

  assert.match(page, /分镜、镜头视频与成片/)
  assert.match(layout, /镜头视频/)
  assert.match(layout, /成片/)
  assert.match(login, /把故事/)
  assert.match(login, /做对/)
  assert.match(login, /把这一集/)
  assert.match(login, /做成片/)
  assert.match(login, /镜头视频/)
  assert.match(login, /时间线/)
})
