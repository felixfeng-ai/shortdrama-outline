import { test } from "node:test"
import assert from "node:assert/strict"

import {
  INTAKE_MODES,
  assessSkillReadiness,
  buildMaterialContext,
} from "../lib/skills/intake.ts"

test("INTAKE1 三种创作起点具有互斥的输入语义", () => {
  assert.deepEqual(
    INTAKE_MODES.map((mode) => mode.label),
    ["从想法开始", "从小说剧本开始", "继续当前项目"],
  )
  assert.equal(new Set(INTAKE_MODES.map((mode) => mode.placeholder)).size, 3)
})

test("INTAKE2 Skill 前置条件按真实项目状态判断", () => {
  const empty = {
    hasIdea: false,
    materialCount: 0,
    characters: 0,
    acts: 0,
    episodes: 0,
    visuals: 0,
    scenes: 0,
    shots: 0,
  }
  assert.deepEqual(assessSkillReadiness("continuity", empty).missing, ["分镜"])
  assert.deepEqual(assessSkillReadiness("adaptation", empty).missing, ["小说 / 剧本原文"])

  const withShots = { ...empty, shots: 8, episodes: 3 }
  assert.equal(assessSkillReadiness("continuity", withShots).ready, true)
  assert.equal(assessSkillReadiness("delivery", withShots).ready, true)
  assert.equal(assessSkillReadiness("cost", withShots).ready, true)
})

test("INTAKE3 原文上下文使用真实正文并遵守字符预算", () => {
  const context = buildMaterialContext([
    {
      name: "小说.txt",
      kind: "novel",
      characterCount: 9000,
      content: "第一章。".repeat(1000),
    },
    {
      name: "剧本.md",
      kind: "script",
      characterCount: 5000,
      content: "第一场 内景。".repeat(1000),
    },
  ], 600)

  assert.match(context, /小说\.txt/)
  assert.match(context, /第一章/)
  assert.ok(context.length <= 900)
  assert.match(context, /已截断/)
})
