import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  AGENT_TOOL_SCHEMAS,
  createToolExecutors,
  type AgentState,
} from "../lib/agent/tools.ts"
import { applyTextFieldEdit, inspectEditTarget } from "../lib/agent/edits.ts"
import { EMPTY_BRIEF } from "../lib/brief.ts"
import { buildMobileAgentState } from "../lib/mobile-agent.ts"
import { applyShotEdit, readMobileShotEdit } from "../lib/mobile-agent-apply.ts"

function state(over: Partial<AgentState> = {}): AgentState {
  return {
    projectTitle: "雨夜快递",
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
      shots: true,
    },
    shots: [],
    expiredShots: 0,
    quota: null,
    ...over,
  }
}

const shots = [
  {
    id: "shot-row-a",
    entityId: "shot-a",
    shot: 1,
    episode: 1,
    scene: "楼道",
    prompt: "wide shot, old version",
    action: "陈默敲门",
  },
  {
    id: "shot-row-b",
    entityId: "shot-b",
    shot: 1,
    episode: 2,
    scene: "天台",
    prompt: "wide shot, old version",
    action: "周放回头",
  },
]

test("PE1 相同展示镜号按稳定 ID 只修改指定镜头", () => {
  const result = applyTextFieldEdit(shots, {
    targetId: "shot-b",
    field: "prompt",
    expectedText: "wide shot, old version",
    newText: "close shot, rain",
    getId: (shot) => shot.entityId,
    label: "第 2 集 · 第 1 镜 · 天台",
  })

  assert.equal(result.status, "current")
  assert.equal(result.items[0].prompt, "wide shot, old version")
  assert.equal(result.items[1].prompt, "close shot, rain")
})

test("PE2 目标正文被改动后拒绝旧提案，不能静默覆盖", () => {
  const edited = shots.map((shot) => shot.entityId === "shot-a"
    ? { ...shot, prompt: "user changed this prompt" }
    : shot)
  const result = applyTextFieldEdit(edited, {
    targetId: "shot-a",
    field: "prompt",
    expectedText: "wide shot, old version",
    newText: "agent replacement",
    getId: (shot) => shot.entityId,
    label: "第 1 集 · 第 1 镜 · 楼道",
  })

  assert.equal(result.status, "drift")
  assert.deepEqual(result.items, edited)
  assert.match(result.message, /已改动/)
  assert.match(result.message, /未覆盖/)
  assert.match(result.message, /重新读取/)
})

test("PE3 目标被删除后拒绝写入", () => {
  const result = applyTextFieldEdit(shots.slice(0, 1), {
    targetId: "shot-b",
    field: "prompt",
    expectedText: "wide shot, old version",
    newText: "new prompt",
    getId: (shot) => shot.entityId,
    label: "第 2 集 · 第 1 镜 · 天台",
  })

  assert.equal(result.status, "missing")
  assert.match(result.message, /不存在/)
})

test("PE4 仅换行符和首尾空白变化不算正文漂移", () => {
  assert.equal(inspectEditTarget("\r\n  same text  \r\n", "same text"), "current")
  assert.equal(inspectEditTarget("same text, changed", "same text"), "drift")
  assert.equal(inspectEditTarget(undefined, "same text"), "missing")
})

test("PE5 Agent 先读稳定目标，镜头提案携带 targetId 与提案时原文", () => {
  const exec = createToolExecutors(state({
    entities: shots.map((shot) => ({
      type: "shot" as const,
      id: shot.entityId,
      name: `第 ${shot.episode} 集 · 第 ${shot.shot} 镜 · ${shot.scene}`,
    })),
    shots: shots.map((shot) => ({
      targetId: shot.entityId,
      shot: shot.shot,
      episode: shot.episode,
      scene: shot.scene,
      characters: ["陈默"],
      missingRefFor: [],
      status: "todo",
      shotSize: "中景",
      camera: "固定",
      prompt: shot.prompt,
      action: shot.action,
      speaker: "",
      dialogue: "",
    })),
  }))

  const targets = exec.list_edit_targets({ targetType: "shot" })
  assert.equal(targets.ok, true)
  assert.match(targets.content, /shot-b/)
  assert.match(targets.content, /第 2 集 · 第 1 镜 · 天台/)

  const proposal = exec.propose_shot_edit({
    targetId: "shot-b",
    target: "prompt",
    newText: "close shot, rain",
    summary: "改成雨夜近景",
  })
  assert.equal(proposal.ok, true)
  assert.equal(proposal.card?.kind, "shot-edit")
  if (proposal.card?.kind === "shot-edit") {
    assert.equal(proposal.card.targetId, "shot-b")
    assert.equal(proposal.card.expectedText, "wide shot, old version")
    assert.match(proposal.card.targetLabel, /第 2 集 · 第 1 镜 · 天台/)
  }

  assert.equal(exec.propose_shot_edit({
    shot: 1,
    target: "prompt",
    newText: "without stable id",
    summary: "旧定位方式",
  }).ok, false)
  assert.equal(exec.propose_shot_edit({
    targetId: "missing",
    target: "prompt",
    newText: "x",
    summary: "不存在",
  }).ok, false)

  const schema = AGENT_TOOL_SCHEMAS.find((tool) => tool.name === "propose_shot_edit")
  assert.deepEqual(schema?.parameters.required, ["targetId", "target", "newText"])
})

test("PE6 实体提案记录当前字段原文，字段必须匹配实体类型", () => {
  const exec = createToolExecutors(state({
    entities: [{
      type: "character",
      id: "char-a",
      name: "陈默",
      fields: { personality: "沉默，不信任陌生人" },
    }],
  }))

  const proposal = exec.propose_entity_edit({
    targetType: "character",
    targetId: "char-a",
    field: "personality",
    newText: "沉默，但会先观察对方的鞋",
    summary: "补一个观察动作",
  })
  assert.equal(proposal.ok, true)
  if (proposal.card?.kind === "entity-edit") {
    assert.equal(proposal.card.expectedText, "沉默，不信任陌生人")
  }
  assert.equal(exec.propose_entity_edit({
    targetType: "character",
    targetId: "char-a",
    field: "space",
    newText: "x",
    summary: "错误字段",
  }).ok, false)
})

test("PE7 工作台与场记共用按 ID 写回和漂移提示", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const dock = fs.readFileSync("components/AgentDock.tsx", "utf8")

  assert.match(page, /applyTextFieldEdit/)
  assert.match(page, /expectedText/)
  assert.match(dock, /inspectEditTarget/)
  assert.match(dock, /目标已改动/)
  assert.match(dock, /disabled=\{editBlocked\}/)
})

test("PE8 移动端 Agent 状态保留镜头稳定 ID、动作和提案原文", () => {
  const mobile = buildMobileAgentState({
    projectTitle: "雨夜快递",
    snapshots: {
      shots: [{
        id: "shot-row-a",
        entityId: "shot-a",
        episode: 1,
        shot: 1,
        scene: "楼道",
        characters: ["陈默"],
        action: "陈默敲门",
        speaker: "",
        dialogue: "",
        prompt: "wide shot",
        shotSize: "中景",
        camera: "固定",
        missingRefFor: [],
        status: "todo",
      }],
    },
    quota: { remaining: 30, limit: 65, projectsLeft: 2 },
  })

  assert.equal(mobile.shots[0].targetId, "shot-a")
  assert.equal(mobile.shots[0].action, "陈默敲门")
  const proposal = createToolExecutors(mobile).propose_shot_edit({
    targetId: "shot-a",
    target: "prompt",
    newText: "close shot",
    summary: "改近景",
  })
  if (proposal.card?.kind === "shot-edit") {
    assert.equal(proposal.card.expectedText, "wide shot")
  }
})

test("PE9 移动端写回优先按稳定 ID，并检测提案原文漂移", () => {
  const payload = [
    { id: "row-a", entityId: "shot-a", shot: 1, prompt: "old a" },
    { id: "row-b", entityId: "shot-b", shot: 1, prompt: "old b" },
  ]
  const edit = readMobileShotEdit({
    targetId: "shot-b",
    expectedText: "old b",
    target: "prompt",
    text: "new b",
  })
  const applied = applyShotEdit(payload, edit)
  assert.equal(applied.shots[0].prompt, "old a")
  assert.equal(applied.shots[1].prompt, "new b")

  const drifted = payload.map((shot) => shot.entityId === "shot-b"
    ? { ...shot, prompt: "user changed b" }
    : shot)
  assert.throws(
    () => applyShotEdit(drifted, edit),
    /已改动/,
  )
})
