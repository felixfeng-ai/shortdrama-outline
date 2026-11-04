import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  GET as getSkills,
  POST as postSkill,
} from "../app/api/personal-skills/route.ts"
import { POST as postSkillVersion } from "../app/api/personal-skills/[id]/versions/route.ts"
import {
  GET as getProjectSkill,
  PUT as putProjectSkill,
} from "../app/api/projects/[id]/skill/route.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const owner = `anon_${"p".repeat(48)}`

function request(pathname: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set("cookie", `chengju_sid=${owner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

function skillIdContext(id: string) {
  return { params: { id } }
}

function projectContext(id: string) {
  return { params: { id } }
}

const input = {
  name: "漫剧情绪流",
  summary: "先做情绪转折，再做视觉奇观。",
  mainDoc: "每集先确认情绪目标，再决定镜头。",
  references: ["情绪没有变化时不要加新设定。"],
  stageRules: { episodes: "每集至少一次情绪反转。" },
  acceptance: ["情绪转折可被一句话说清"],
}

test("PSA1 可通过 API 创建、发版并列举个人 Skill", async () => {
  __resetDbForTests(":memory:")
  const created = await postSkill(
    request("/api/personal-skills", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  )
  assert.equal(created.status, 200)
  const skill = (await created.json()).data.skill
  assert.equal(skill.name, "漫剧情绪流")
  assert.equal(skill.currentVersion, 1)

  const published = await postSkillVersion(
    request(`/api/personal-skills/${skill.id}/versions`, {
      method: "POST",
      body: JSON.stringify({ ...input, mainDoc: "先定情绪转折，再排镜头。" }),
    }),
    skillIdContext(skill.id),
  )
  assert.equal(published.status, 200)
  assert.equal((await published.json()).data.skill.currentVersion, 2)

  const listed = await getSkills(request("/api/personal-skills"))
  assert.equal(listed.status, 200)
  const skills = (await listed.json()).data.skills
  assert.equal(skills.length, 1)
  assert.equal(skills[0].versions.length, 2)
})

test("PSA2 项目可绑定 Skill 版本并读取固定版本", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "Skill API 项目", owner)
  const created = await postSkill(
    request("/api/personal-skills", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  )
  const skill = (await created.json()).data.skill

  const applied = await putProjectSkill(
    request(`/api/projects/${project.id}/skill`, {
      method: "PUT",
      body: JSON.stringify({ skillId: skill.id, version: 1 }),
    }),
    projectContext(project.id),
  )
  assert.equal(applied.status, 200)
  assert.equal((await applied.json()).data.binding.skillVersion, 1)

  const read = await getProjectSkill(
    request(`/api/projects/${project.id}/skill`),
    projectContext(project.id),
  )
  assert.equal(read.status, 200)
  const binding = (await read.json()).data.binding
  assert.equal(binding.name, "漫剧情绪流")
  assert.equal(binding.skillVersion, 1)
})

test("PSA3 Agent 页面传入当前 Skill，Skill 页面提供个人方法入口", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const skillsPage = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  const panel = fs.readFileSync("components/PersonalSkillPanel.tsx", "utf8")
  assert.match(page, /fetchProjectSkill/)
  assert.match(page, /skill: projectSkill/)
  assert.match(skillsPage, /PersonalSkillPanel/)
  assert.match(panel, /createPersonalSkill/)
  assert.match(panel, /发布新版本/)
})
