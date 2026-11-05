import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createToolExecutors } from "../lib/agent/tools.ts"
import { buildMobileAgentState } from "../lib/mobile-agent.ts"

test("移动端 Agent 能把项目决策、否决原因和开放批注交给工具", () => {
  const state = buildMobileAgentState({
    projectTitle: "雨夜快递",
    snapshots: {},
    quota: { remaining: 20, limit: 65, projectsLeft: 1 },
    decisions: [{
      id: "decision-1",
      step: "shots",
      question: "第 3 集钩子",
      chosenValue: "车票留在门缝",
      reason: "比直接解释人物关系更有悬念",
      status: "accepted",
      locked: false,
    }],
    judgments: [{
      id: "judgment-1",
      step: "shots",
      action: "否决车祸反转",
      reason: "前两集没有铺垫",
      createdAt: 100,
    }],
    comments: [{
      id: "comment-1",
      targetType: "shot",
      targetId: "shot-a",
      targetName: "第 3 集 · 第 3 镜",
      body: "门口不要太亮",
      status: "open",
    }],
  })
  const executors = createToolExecutors(state)

  const decisions = executors.get_decisions({})
  assert.equal(decisions.ok, true)
  assert.match(decisions.content, /车票留在门缝/)
  assert.match(decisions.content, /比直接解释人物关系更有悬念/)

  const status = executors.get_project_status({})
  assert.match(status.content, /否决车祸反转/)
  assert.match(status.content, /前两集没有铺垫/)

  const comments = executors.get_entity_comments({
    targetType: "shot",
    targetId: "shot-a",
  })
  assert.equal(comments.ok, true)
  assert.match(comments.content, /第 3 集 · 第 3 镜/)
  assert.match(comments.content, /门口不要太亮/)
})

test("移动端 Agent 路由会从数据库读取决策、判断和批注", () => {
  const route = fs.readFileSync("app/api/mobile/agent/route.ts", "utf8")

  assert.match(route, /listProjectDecisions/)
  assert.match(route, /listProjectJudgments/)
  assert.match(route, /listEntityComments/)
  assert.match(route, /decisions:/)
  assert.match(route, /judgments:/)
  assert.match(route, /comments:/)
})
