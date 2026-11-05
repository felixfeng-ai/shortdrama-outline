import assert from "node:assert/strict"
import test from "node:test"

import { createToolExecutors, type AgentState } from "../lib/agent/tools.ts"
import { EMPTY_BRIEF } from "../lib/brief.ts"

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
      characters: true,
      acts: true,
      episodes: true,
      visuals: true,
      scenes: true,
      shots: true,
    },
    shots: [{
      targetId: "shot-a",
      episode: 1,
      shot: 1,
      scene: "城郊别墅·门外",
      characters: ["陈默"],
      missingRefFor: [],
      status: "todo",
      shotSize: "中景",
      camera: "固定",
      prompt: "rainy gate",
      action: "陈默抬头",
      speaker: "",
      dialogue: "",
    }],
    expiredShots: 0,
    quota: { remaining: 20, limit: 65, projectsLeft: 1 },
    ...over,
  }
}

test("Agent 视频预算卡按真实价格计算，并且不触发生成任务", () => {
  const executors = createToolExecutors(state())
  const result = executors.propose_video_plan({
    shotIds: ["shot-a"],
    model: "MiniMax-H3-Lite",
    resolution: "768P",
    durationSeconds: 5,
    budgetLimitMicros: 2_000_000,
  })

  assert.equal(result.ok, true)
  assert.equal(result.card?.kind, "video-plan")
  if (result.card?.kind !== "video-plan") return
  assert.deepEqual(result.card.shotIds, ["shot-a"])
  assert.equal(result.card.shotCount, 1)
  assert.equal(result.card.durationSeconds, 5)
  assert.equal(result.card.model, "MiniMax-H3-Lite")
  assert.equal(result.card.resolution, "768P")
  assert.equal(result.card.estimatedCostMicros, 1_300_000)
  assert.equal(result.card.budgetLimitMicros, 2_000_000)
})

test("Agent 视频预算卡拒绝未知镜头、非法模型和超预算计划", () => {
  const executors = createToolExecutors(state())

  assert.equal(executors.propose_video_plan({
    shotIds: ["missing"],
    model: "MiniMax-H3-Lite",
    resolution: "768P",
    durationSeconds: 5,
    budgetLimitMicros: 2_000_000,
  }).ok, false)

  assert.equal(executors.propose_video_plan({
    shotIds: ["shot-a"],
    model: "unknown-model",
    resolution: "768P",
    durationSeconds: 5,
    budgetLimitMicros: 2_000_000,
  }).ok, false)

  assert.equal(executors.propose_video_plan({
    shotIds: ["shot-a"],
    model: "MiniMax-H3-Lite",
    resolution: "768P",
    durationSeconds: 5,
    budgetLimitMicros: 1_000_000,
  }).ok, false)
})
