import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { SKILL_CATALOG } from "../lib/skills/catalog.ts"
import {
  buildSkillExecutionPlan,
  maxModelCallsForSkill,
  recommendSkillsForProject,
} from "../lib/skills/plan.ts"
import type { IntakeProjectState } from "../lib/skills/intake.ts"

const emptyState: IntakeProjectState = {
  hasIdea: false,
  materialCount: 0,
  characters: 0,
  acts: 0,
  episodes: 0,
  visuals: 0,
  scenes: 0,
  shots: 0,
}

const adaptation = SKILL_CATALOG.find((skill) => skill.id === "adaptation")!
const delivery = SKILL_CATALOG.find((skill) => skill.id === "delivery")!

test("SP1 改编计划显示真实上下文、逐步输入产物和写前确认", () => {
  const plan = buildSkillExecutionPlan(adaptation, {
    state: {
      ...emptyState,
      materialCount: 2,
      episodes: 12,
    },
    projectTitle: "雨夜来信",
    briefReady: true,
  })

  assert.equal(plan.skillId, "adaptation")
  assert.equal(plan.writes, true)
  assert.ok(plan.context.some((item) => item.includes("2 份原文")))
  assert.ok(plan.context.some((item) => item.includes("12 集")))
  assert.ok(plan.steps.length >= 3)
  for (const step of plan.steps) {
    assert.ok(step.title)
    assert.ok(step.input)
    assert.ok(step.output)
  }
  assert.ok(plan.confirmations.some((item) => /写入|修改/.test(item)))
  assert.ok(plan.recovery.length > 0)
  assert.ok(plan.outputPreview.length >= 2)
  assert.equal(plan.maxModelCalls, 6)
  assert.equal(plan.units.max, 6)
})

test("SP2 确定性 Skill 明确显示 0 模型调用、0 额度和真实输出结构", () => {
  const plan = buildSkillExecutionPlan(delivery, {
    state: { ...emptyState, shots: 18 },
    projectTitle: "雨夜来信",
    briefReady: false,
  })

  assert.equal(plan.maxModelCalls, 0)
  assert.equal(plan.units.min, 0)
  assert.equal(plan.units.max, 0)
  assert.equal(plan.writes, false)
  assert.ok(plan.steps.some((step) => step.output.includes("阻断项")))
  assert.ok(plan.outputPreview.some((item) => stepText(item).includes("18")))
  assert.ok(plan.recovery.includes("重新运行"))
})

test("SP3 项目已有分镜时优先推荐连续性、交付和成本", () => {
  const recommendations = recommendSkillsForProject({
    mode: "project",
    state: {
      ...emptyState,
      hasIdea: true,
      characters: 4,
      acts: 3,
      episodes: 10,
      visuals: 4,
      scenes: 20,
      shots: 36,
    },
    query: "",
  })

  assert.equal(recommendations.length, 3)
  assert.equal(recommendations[0].skill.id, "continuity")
  assert.ok(recommendations.some((item) => item.skill.id === "delivery"))
  assert.ok(recommendations.every((item) => item.reason.length > 0))
})

test("SP4 原文模式优先推荐改编，并如实展示前置状态", () => {
  const recommendations = recommendSkillsForProject({
    mode: "source",
    state: { ...emptyState, materialCount: 3 },
    query: "",
  })

  assert.equal(recommendations[0].skill.id, "adaptation")
  assert.equal(recommendations[0].readiness.ready, true)
  assert.ok(recommendations.some((item) => !item.readiness.ready))
})

test("SP5 Agent 循环上限与计划额度上限共用一份映射", () => {
  assert.equal(maxModelCallsForSkill("adaptation"), 6)
  assert.equal(maxModelCallsForSkill("story-doctor"), 3)
  assert.equal(maxModelCallsForSkill("canon"), 4)
  assert.equal(maxModelCallsForSkill("continuity"), 0)
  assert.equal(maxModelCallsForSkill("delivery"), 0)
  assert.equal(maxModelCallsForSkill("cost"), 0)
})

test("SP6 页面、组件与 Agent 已接入计划，不再点击 Skill 就直接执行", () => {
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  const drawer = fs.readFileSync("components/SkillAgentDrawer.tsx", "utf8")
  const plan = fs.existsSync("components/SkillExecutionPlan.tsx")
    ? fs.readFileSync("components/SkillExecutionPlan.tsx", "utf8")
    : ""
  const css = fs.readFileSync("app/skills/skills.css", "utf8")

  assert.ok(catalog.includes("recommendSkillsForProject"))
  assert.ok(catalog.includes("buildSkillExecutionPlan"))
  assert.ok(catalog.includes("<SkillExecutionPlan"))
  assert.ok(catalog.includes("skill-recommendations"))
  assert.ok(plan.includes("确认并交给 Agent"))
  assert.ok(plan.includes("执行步骤"))
  assert.ok(plan.includes("额度上限"))
  assert.ok(plan.includes("中断恢复"))
  assert.ok(drawer.includes("maxModelCallsForSkill"))
  assert.ok(drawer.includes("maxModelCalls:"))
  assert.ok(css.includes(".skill-page .execution-plan"))
  assert.ok(css.includes(".skill-page .skill-recommendations"))
  assert.ok(css.includes(".skill-page .execution-plan-primary"))
  assert.ok(css.includes("min-height: 44px"))
})

function stepText(value: string): string {
  return value.replace(/\s+/g, " ")
}
