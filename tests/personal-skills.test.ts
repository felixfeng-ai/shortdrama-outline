import { test } from "node:test"
import assert from "node:assert/strict"

import { AGENT_TOOL_SCHEMAS, createToolExecutors, type AgentState } from "../lib/agent/tools.ts"
import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { listProjectJudgments } from "../lib/assets/decisions.ts"
import { EMPTY_BRIEF } from "../lib/brief.ts"
import {
  applySkillToProject,
  createPersonalSkill,
  getProjectSkillBinding,
  listPersonalSkills,
  publishPersonalSkillVersion,
} from "../lib/skills/personal.ts"

const owner = `anon_${"k".repeat(48)}`
const otherOwner = `anon_${"m".repeat(48)}`

function skillInput(over: Record<string, unknown> = {}) {
  return {
    name: "低成本强钩子短剧",
    summary: "前三秒进入冲突，每集保留一个信息增量。",
    mainDoc: "先核对人物动机，再写分集钩子。没有通过 Canon 检查前不进入分镜。",
    references: ["本集冲突必须推动人物关系变化。"],
    stageRules: {
      acts: "三幕每幕都要有明确的阻力升级。",
      episodes: "每集结尾必须产生新信息。",
    },
    acceptance: [
      "前三秒能看懂冲突",
      "每集至少一个信息增量",
      "人物行为不违背当前 Canon",
    ],
    ...over,
  }
}

function agentState(over: Partial<AgentState> = {}): AgentState {
  return {
    projectTitle: "Skill 测试",
    hasIdea: true,
    brief: EMPTY_BRIEF,
    judgments: [],
    decisions: [],
    canonIssues: [],
    episodes: [],
    completed: {
      characters: false,
      acts: false,
      episodes: false,
      visuals: false,
      scenes: false,
      shots: false,
    },
    shots: [],
    expiredShots: 0,
    quota: null,
    ...over,
  }
}

test("PS1 创建个人 Skill 时写入不可变 v1，并拒绝空内容", () => {
  const db = openDb(":memory:")
  try {
    const skill = createPersonalSkill(db, owner, skillInput(), 1_700_000_000_000)
    assert.equal(skill.name, "低成本强钩子短剧")
    assert.equal(skill.currentVersion, 1)
    assert.equal(skill.latestVersion.mainDoc, skillInput().mainDoc)
    assert.deepEqual(skill.latestVersion.acceptance, skillInput().acceptance)

    assert.throws(
      () => createPersonalSkill(db, owner, skillInput({ name: " " })),
      /名称/,
    )
    assert.throws(
      () => createPersonalSkill(db, owner, skillInput({ mainDoc: "" })),
      /主文档/,
    )
  } finally {
    db.close()
  }
})

test("PS2 修改 Skill 创建 v2，旧版本仍然可追溯", () => {
  const db = openDb(":memory:")
  try {
    const created = createPersonalSkill(db, owner, skillInput(), 100)
    const updated = publishPersonalSkillVersion(db, owner, created.id, {
      ...skillInput({ mainDoc: "新版规则：先做人物关系冲突，再做钩子。" }),
      changeNote: "加入人物关系硬冲突",
    }, 200)

    assert.equal(updated.currentVersion, 2)
    assert.equal(updated.latestVersion.mainDoc, "新版规则：先做人物关系冲突，再做钩子。")
    assert.equal(updated.versions.length, 2)
    assert.equal(updated.versions[0].version, 1)
    assert.equal(updated.versions[1].version, 2)

    const listed = listPersonalSkills(db, owner)
    assert.equal(listed.length, 1)
    assert.equal(listed[0].currentVersion, 2)
  } finally {
    db.close()
  }
})

test("PS3 项目只能绑定自己可见且存在的 Skill 版本", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "Skill 绑定项目", owner)
    const skill = createPersonalSkill(db, owner, skillInput(), 300)
    const foreign = createPersonalSkill(db, otherOwner, skillInput({ name: "别人的 Skill" }), 301)

    const binding = applySkillToProject(db, project.id, owner, skill.id, 1, 400)
    assert.equal(binding.skillId, skill.id)
    assert.equal(binding.skillVersion, 1)
    assert.equal(getProjectSkillBinding(db, project.id)?.name, skill.name)
    assert.equal(listProjectJudgments(db, project.id).length, 1)

    assert.throws(
      () => applySkillToProject(db, project.id, owner, foreign.id, 1, 401),
      /不存在|无权/,
    )
    assert.throws(
      () => applySkillToProject(db, project.id, owner, skill.id, 99, 402),
      /版本/,
    )
  } finally {
    db.close()
  }
})

test("PS4 Agent 带当前 Skill 上下文，并可通过只读工具读取", () => {
  const state = agentState({
    skill: {
      id: "skill_1",
      name: "低成本强钩子短剧",
      version: 2,
      summary: "前三秒进入冲突",
      stageRules: { episodes: "每集结尾必须产生新信息" },
      acceptance: ["前三秒能看懂冲突"],
    },
  })
  const executors = createToolExecutors(state)
  assert.ok(AGENT_TOOL_SCHEMAS.some((tool) => tool.name === "get_active_skill"))
  const result = executors.get_active_skill({})
  assert.equal(result.ok, true)
  assert.match(result.content, /低成本强钩子短剧/)
  assert.match(result.content, /v2/)
  assert.match(result.content, /前三秒进入冲突/)
})
