import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  agentStepLabel,
  buildAppAgentState,
  type AppDemoProject,
  type AppDemoProjectDetails,
} from "../lib/app-demo-data.ts"

const project: AppDemoProject = {
  id: "p1",
  title: "回声车站",
  initial: "回",
  episode: "EP03",
  episodeLabel: "第 3 集",
  scene: "地下站台",
  sceneCode: "EP03 · SC02",
  question: "下一句留下什么？",
  quote: "“你等的不是我。”",
  update: "第 3 集 · 2 个镜头",
  status: "刚刚更新 · Web 项目",
  storyState: "正在写",
  shot: "第 9 镜",
  stepCount: "2 个镜头",
  workTitle: "第 9 镜 · 调度校准",
  workLead: "顾遥把车票压在灯箱下。",
  decision: "调整顾遥的台词",
  source: "web",
}

const details: AppDemoProjectDetails = {
  episodes: [
    { id: "ep-3", number: 3, title: "末班车", synopsis: "雨夜追踪。", hook: "车票上的名字不是她。", intensity: 4 },
  ],
  scenes: [
    { id: "sc-2", number: 2, episode: 3, location: "地下站台", timeOfDay: "夜", summary: "两人对峙。", characters: ["顾遥"] },
  ],
  shots: [
    {
      id: "s9", entityId: "e9", shot: 9, episode: 3, scene: "地下站台", characters: ["顾遥"],
      action: "顾遥把车票压在灯箱下。", speaker: "顾遥", dialogue: "你等的不是我。",
      place: "地下站台", shotSize: "近景", camera: "固定", prompt: "shot 9",
      refImages: [], missingRefFor: [], params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "rework",
    },
    {
      id: "s10", entityId: "e10", shot: 10, episode: 3, scene: "地下站台", characters: ["顾遥"],
      action: "灯箱熄灭。", speaker: "", dialogue: "", place: "地下站台",
      shotSize: "全景", camera: "拉", prompt: "shot 10", refImages: [], missingRefFor: [],
      params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo",
    },
  ],
}

test("AC1 项目快照构建为真实 AgentState", () => {
  const state = buildAppAgentState(project, details)
  assert.equal(state.projectTitle, "回声车站")
  assert.equal(state.completed.episodes, true)
  assert.equal(state.completed.scenes, true)
  assert.equal(state.completed.shots, true)
  assert.equal(state.completed.characters, false)
  assert.equal(state.shots.length, 2)
  assert.equal(state.shots[0].status, "rework")
  assert.equal(state.episodes[0].hook, "车票上的名字不是她。")
})

test("AC2 工具名转换为用户可读过程标签", () => {
  assert.equal(agentStepLabel("get_project_status"), "项目状态")
  assert.equal(agentStepLabel("audit_shots"), "分镜")
  assert.equal(agentStepLabel("unknown_tool"), "unknown_tool")
})

test("AC3 对话接入 /api/agent 与 Agent 循环，不再使用固定回复", () => {
  const source = fs.readFileSync("components/DoubaoStyleAgentApp.tsx", "utf8")
  assert.ok(source.includes("runAgentLoop"), "没有使用现有 Agent 循环")
  assert.ok(source.includes("/api/agent"), "没有调用真实 Agent 接口")
  assert.ok(source.includes("agentSteps"), "没有展示工具过程")
  assert.ok(source.includes("buildAppAgentState"), "没有构建项目上下文")
  assert.ok(!source.includes("我检查完${activeProject.episodeLabel}"), "仍在返回固定示例回复")
})
