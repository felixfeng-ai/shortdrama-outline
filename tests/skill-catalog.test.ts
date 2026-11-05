import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  SKILL_CATALOG,
  filterSkillCatalog,
  matchSkillForPrompt,
} from "../lib/skills/catalog.ts"

test("SKILL1 官方目录包含六类创作能力且缩略图存在", () => {
  assert.equal(SKILL_CATALOG.length, 6)
  assert.ok(SKILL_CATALOG.some((skill) => skill.id === "adaptation"))
  assert.ok(SKILL_CATALOG.some((skill) => skill.id === "continuity"))
  for (const skill of SKILL_CATALOG) {
    assert.ok(fs.existsSync(`public${skill.image}`), `缺少 Skill 缩略图：${skill.image}`)
  }
})

test("SKILL2 推荐、收藏、分类与搜索可以组合筛选", () => {
  assert.equal(filterSkillCatalog({ library: "recommend" }).length, 6)
  assert.equal(filterSkillCatalog({ library: "favorite" }).length, 3)
  assert.deepEqual(
    filterSkillCatalog({ library: "recommend", category: "交付效率" }).map((skill) => skill.id),
    ["delivery", "cost"],
  )
  assert.deepEqual(
    filterSkillCatalog({ library: "recommend", query: "分镜" }).map((skill) => skill.id),
    ["continuity"],
  )
})

test("SKILL3 任务输入可匹配到合适的 Skill", () => {
  assert.equal(matchSkillForPrompt("把这部小说改成 12 集").id, "adaptation")
  assert.equal(matchSkillForPrompt("检查钩子和节奏").id, "story-doctor")
  assert.equal(matchSkillForPrompt("检查镜头首尾帧").id, "continuity")
  assert.equal(matchSkillForPrompt("按即梦导出规格预检").id, "delivery")
  assert.equal(matchSkillForPrompt("估算生成成本").id, "cost")
})

test("SKILL4 正式页面复用真实 Agent，而不是静态假对话", () => {
  const page = fs.readFileSync("app/skills/page.tsx", "utf8")
  const agent = fs.readFileSync("components/SkillAgentDrawer.tsx", "utf8")
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  const app = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(page.includes("SkillCatalog"))
  assert.ok(agent.includes("runAgentLoop"))
  assert.ok(agent.includes("createToolExecutors"))
  assert.ok(agent.includes("/api/agent"))
  assert.ok(app.includes("<SkillCatalog embedded />"))
  assert.ok(app.includes("openWorkspaceMode('create')"))
  assert.ok(catalog.includes("requestedProjectId"))
  assert.ok(catalog.includes("new URLSearchParams(window.location.search)"))
  assert.ok(catalog.includes("<span>创作技能</span>"))
  assert.ok(catalog.includes("title-separator"))
  assert.ok(catalog.includes("localMaterialInput"))
})

test("SKILL5 创意入口区分三种起点并把项目原文送入 Agent", () => {
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  const api = fs.readFileSync("lib/assets/api.ts", "utf8")
  const intake = fs.readFileSync("lib/skills/intake.ts", "utf8")

  assert.ok(catalog.includes("INTAKE_MODES"))
  assert.ok(catalog.includes("fetchProjectMaterials"))
  assert.ok(catalog.includes("createProjectMaterial"))
  assert.ok(catalog.includes("deleteProjectMaterial"))
  assert.ok(catalog.includes("buildMaterialContext"))
  assert.ok(catalog.includes("assessSkillReadiness"))
  assert.ok(intake.includes("从想法开始"))
  assert.ok(intake.includes("从小说剧本开始"))
  assert.ok(intake.includes("继续当前项目"))
  assert.ok(catalog.includes('accept=".txt,.md,text/plain,text/markdown"'))
  assert.ok(api.includes("/materials"))
  assert.ok(!fs.readFileSync("lib/skills/catalog.ts", "utf8").includes("按章节计费"))
})
