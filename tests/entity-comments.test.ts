import { test } from "node:test"
import assert from "node:assert/strict"

import { AGENT_TOOL_SCHEMAS, createToolExecutors, type AgentState } from "../lib/agent/tools.ts"
import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { EMPTY_BRIEF } from "../lib/brief.ts"
import {
  createEntityComment,
  listEntityComments,
  updateEntityComment,
} from "../lib/entity-comments.ts"

const owner = `anon_${"c".repeat(48)}`

function projectWithEntities() {
  const db = openDb(":memory:")
  const project = createProject(db, "评论测试", owner)
  createSnapshot(db, {
    projectId: project.id,
    kind: "characters",
    payload: [{ id: "char-row-1", entityId: "char-entity-1", name: "林远" }],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "episodes",
    payload: [{ id: "ep-1", number: 3, title: "雨夜" }],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualPlaces",
    payload: [{ id: "place-1", name: "旧报社" }],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      id: "shot-row-1",
      entityId: "shot-entity-1",
      episode: 3,
      shot: 7,
      scene: "雨夜天台",
    }],
  })
  return { db, project }
}

function agentState(over: Partial<AgentState> = {}): AgentState {
  return {
    projectTitle: "评论项目",
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
    shots: [],
    expiredShots: 0,
    quota: null,
    entities: [{
      type: "character",
      id: "char-entity-1",
      name: "林远",
    }],
    entityComments: [{
      id: "comment-1",
      targetType: "character",
      targetId: "char-entity-1",
      targetName: "林远",
      body: "他这里不会主动示弱，改成先沉默再反问。",
      status: "open",
    }],
    ...over,
  }
}

test("EC1 评论只能锚定当前项目真实存在的实体", () => {
  const { db, project } = projectWithEntities()
  try {
    const comment = createEntityComment(db, project.id, owner, {
      targetType: "character",
      targetId: "char-entity-1",
      body: "他这里不会主动示弱，改成先沉默再反问。",
    }, 100)
    assert.equal(comment.targetName, "林远")
    assert.equal(comment.status, "open")

    assert.throws(
      () => createEntityComment(db, project.id, owner, {
        targetType: "character",
        targetId: "missing",
        body: "不存在的角色",
      }),
      /实体不存在/,
    )
    assert.throws(
      () => createEntityComment(db, project.id, owner, {
        targetType: "free-text",
        targetId: "shot-entity-1",
        body: "自由文本锚点",
      }),
      /类型/,
    )
    assert.throws(
      () => createEntityComment(db, project.id, owner, {
        targetType: "shot",
        targetId: "shot-entity-1",
        body: " ",
      }),
      /正文/,
    )
  } finally {
    db.close()
  }
})

test("EC2 评论按项目隔离，并可从 open 标为 resolved", () => {
  const { db, project } = projectWithEntities()
  const other = createProject(db, "另一个项目", owner)
  try {
    const comment = createEntityComment(db, project.id, owner, {
      targetType: "shot",
      targetId: "shot-entity-1",
      body: "这一镜不要切特写，保留天台全景。",
    }, 200)
    assert.equal(listEntityComments(db, project.id).length, 1)
    assert.equal(listEntityComments(db, other.id).length, 0)

    const resolved = updateEntityComment(db, project.id, comment.id, owner, {
      status: "resolved",
    }, 300)
    assert.equal(resolved.status, "resolved")
    assert.equal(resolved.resolvedAt, 300)
  } finally {
    db.close()
  }
})

test("EC3 现场 Take 保存连续性结果，同一镜头只能有一个好镜", () => {
  const { db, project } = projectWithEntities()
  try {
    const first = createEntityComment(db, project.id, owner, {
      targetType: "shot",
      targetId: "shot-entity-1",
      body: "雨停后重拍，演员站位比上条更稳。",
      kind: "take",
      isBest: true,
      continuityStatus: "issues",
      continuitySummary: "门口亮度偏高，其他一致",
      continuityIssueCount: 2,
    }, 250)
    assert.equal(first.kind, "take")
    assert.equal(first.isBest, true)
    assert.equal(first.continuityStatus, "issues")
    assert.equal(first.continuityIssueCount, 2)

    const second = createEntityComment(db, project.id, owner, {
      targetType: "shot",
      targetId: "shot-entity-1",
      body: "补一个侧逆光版本。",
      kind: "take",
      isBest: true,
      continuityStatus: "passed",
      continuitySummary: "人物、地点和道具一致",
      continuityIssueCount: 0,
    }, 300)
    const third = createEntityComment(db, project.id, owner, {
      targetType: "shot",
      targetId: "shot-entity-1",
      body: "再补一条更稳的侧拍。",
      kind: "take",
    }, 350)

    const takes = listEntityComments(db, project.id, {
      targetType: "shot",
      targetId: "shot-entity-1",
    }).filter((comment) => comment.kind === "take")
    assert.equal(takes.length, 3)
    assert.equal(takes.filter((take) => take.isBest).length, 1)
    assert.equal(takes.find((take) => take.isBest)?.id, second.id)

    updateEntityComment(db, project.id, third.id, owner, { isBest: true }, 400)
    const updatedTakes = listEntityComments(db, project.id, {
      targetType: "shot",
      targetId: "shot-entity-1",
    }).filter((comment) => comment.kind === "take")
    assert.equal(updatedTakes.filter((take) => take.isBest).length, 1)
    assert.equal(updatedTakes.find((take) => take.isBest)?.id, third.id)
  } finally {
    db.close()
  }
})

test("EC4 Agent 能读取评论，只生成实体级待确认修改卡", () => {
  const state = agentState()
  const executors = createToolExecutors(state)
  assert.ok(AGENT_TOOL_SCHEMAS.some((tool) => tool.name === "get_entity_comments"))
  assert.ok(AGENT_TOOL_SCHEMAS.some((tool) => tool.name === "propose_entity_edit"))

  const listed = executors.get_entity_comments({ targetType: "character", targetId: "char-entity-1" })
  assert.equal(listed.ok, true)
  assert.match(listed.content, /不会主动示弱/)

  const proposal = executors.propose_entity_edit({
    targetType: "character",
    targetId: "char-entity-1",
    summary: "调整林远的反应",
    newText: "先沉默半拍，再反问。",
  })
  assert.equal(proposal.ok, true)
  assert.equal(proposal.card?.kind, "entity-edit")
  if (proposal.card?.kind === "entity-edit") {
    assert.equal(proposal.card.targetId, "char-entity-1")
    assert.equal(proposal.card.targetName, "林远")
  }
  assert.equal(state.entityComments?.length, 1, "propose 不能产生副作用")
})
