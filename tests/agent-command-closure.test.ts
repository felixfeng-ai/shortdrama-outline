import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createToolExecutors } from "../lib/agent/tools.ts"
import { applyAgentCommand } from "../lib/agent/commands.ts"
import { createProject, createSnapshot, latestSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { getQuickTrialRun } from "../lib/production/quick-trial-repo.ts"
import { listGenerationTasks } from "../lib/generation/repo.ts"
import { loadCanvasGraph } from "../lib/canvas-graph-repo.ts"

const owner = `anon_${"c".repeat(48)}`

test("AC1 Agent 只能提出 command-plan，提案本身不写数据库", () => {
  const exec = createToolExecutors({
    projectTitle: "命令提案",
    hasIdea: false,
    brief: {} as never,
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
  })
  const result = exec.propose_agent_command({
    command: "quick-trial",
    title: "先跑一版动态分镜",
    summary: "用一句话生成 5 镜头动态分镜",
    payload: { idea: "继承人婚礼当天发现死亡证明被伪造", target: "keyframe" },
  })

  assert.equal(result.ok, true)
  assert.equal(result.card?.kind, "command-plan")
  assert.match(result.content, /等待确认/)
})

test("AC2 快速试片命令写入同一快速试片断点", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "Agent 快速试片", owner)
  const result = await applyAgentCommand(db, {
    projectId: project.id,
    ownerId: owner,
    identity: owner,
    command: "quick-trial",
    payload: {
      idea: "外卖员收到失踪妹妹寄来的录音",
      target: "keyframe",
    },
  })

  assert.equal(result.command, "quick-trial")
  assert.equal(getQuickTrialRun(db, project.id)?.target, "keyframe")
})

test("AC3 图像批量命令从稳定镜头生成持久任务", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "Agent 图像批量", owner)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      id: "shot-id",
      entityId: "shot-entity",
      episode: 1,
      shot: 1,
      prompt: "cinematic frame",
      params: { ratio: "9:16", duration: 10 },
    }],
  })
  const result = await applyAgentCommand(db, {
    projectId: project.id,
    ownerId: owner,
    identity: owner,
    command: "image-batch",
    payload: { shotIds: ["shot-entity"], concurrency: 2 },
  })

  assert.equal(result.command, "image-batch")
  assert.equal(listGenerationTasks(db, project.id).length, 1)
})

test("AC4 批量返修命令写入新分镜快照", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "Agent 批量返修", owner)
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualCharacters",
    payload: [{
      name: "林晚",
      age: "28",
      face: "鹅蛋脸",
      hair: "黑色短发",
      marks: "眉尾浅痣",
      wardrobe: "白色衬衫",
      props: "",
      anchor: "Lin Wan, 28, oval face, short black hair, white shirt",
    }],
  })
  const before = createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      id: "shot-id",
      entityId: "shot-entity",
      episode: 1,
      shot: 1,
      characters: ["林晚"],
      prompt: "medium shot without anchor",
      action: "回头",
      missingRefFor: [],
      status: "done",
    }],
  })
  const result = await applyAgentCommand(db, {
    projectId: project.id,
    ownerId: owner,
    identity: owner,
    command: "batch-rework",
    payload: { action: "repair-anchors", shotIds: ["shot-entity"] },
  })

  assert.equal(result.command, "batch-rework")
  assert.notEqual(latestSnapshot(db, project.id, "shots")?.id, before.id)
})

test("AC5 画布动作命令按 revision 保存节点", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "Agent 画布", owner)
  const result = await applyAgentCommand(db, {
    projectId: project.id,
    ownerId: owner,
    identity: owner,
    command: "canvas-action",
    payload: {
      expectedRevision: 0,
      operations: [{
        type: "add-node",
        nodeType: "note",
        title: "下一场反转",
        body: "让证据在婚礼现场出现",
      }],
    },
  })

  assert.equal(result.command, "canvas-action")
  assert.equal(loadCanvasGraph(db, project.id)?.revision, 1)
})

test("AC6 AgentDock 与确认接口接入统一命令执行", () => {
  const dock = fs.readFileSync("components/AgentDock.tsx", "utf8")
  const route = fs.readFileSync("app/api/projects/[id]/agent-commands/route.ts", "utf8")

  assert.match(dock, /command-plan/)
  assert.match(dock, /onExecuteAgentCommand/)
  assert.match(route, /confirmed/)
  assert.match(route, /applyAgentCommand/)
  assert.match(route, /enforceApiRateLimit/)
})
