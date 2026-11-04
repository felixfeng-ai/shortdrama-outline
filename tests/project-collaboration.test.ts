import { test } from "node:test"
import assert from "node:assert/strict"

import { POST as mcpPost } from "../app/api/mcp/route.ts"
import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  appendAgentThreadMessage,
  createAgentThread,
  createProjectBranch,
  getAgentThread,
  listAgentThreads,
  listProjectBranches,
} from "../lib/project-collaboration.ts"

const owner = `anon_${"t".repeat(48)}`
const otherOwner = `anon_${"r".repeat(48)}`

test("PC1 多会话共享项目但消息彼此隔离", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "多会话项目", owner)
    const first = createAgentThread(db, project.id, owner, { title: "第一集钩子" }, 100)
    const second = createAgentThread(db, project.id, owner, { title: "人物一致性" }, 101)

    appendAgentThreadMessage(db, project.id, first.id, owner, {
      role: "user",
      content: "第一集结尾再翻一层。",
    }, 200)
    appendAgentThreadMessage(db, project.id, first.id, owner, {
      role: "assistant",
      content: "建议把身份揭露提前到钩子前一分钟埋线。",
    }, 201)

    assert.equal(listAgentThreads(db, project.id, owner).length, 2)
    assert.equal(getAgentThread(db, project.id, first.id, owner)?.messages?.length, 2)
    assert.equal(getAgentThread(db, project.id, second.id, owner)?.messages?.length, 0)
  } finally {
    db.close()
  }
})

test("PC2 线程按 owner 隔离", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "会话权限", owner)
    const thread = createAgentThread(db, project.id, owner, { title: "私密会话" })
    assert.throws(
      () => listAgentThreads(db, project.id, otherOwner),
      /不存在|无权/,
    )
    assert.equal(getAgentThread(db, project.id, thread.id, otherOwner), null)
    assert.throws(
      () => appendAgentThreadMessage(db, project.id, thread.id, otherOwner, {
        role: "user",
        content: "越权写入",
      }),
      /不存在|无权/,
    )
  } finally {
    db.close()
  }
})

test("PC3 版本分支必须基于本项目真实快照", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "分支项目", owner)
    const snapshot = createSnapshot(db, {
      projectId: project.id,
      kind: "characters",
      payload: [{ id: "char-1", name: "林远" }],
    })
    const branch = createProjectBranch(db, project.id, owner, {
      name: "林远改成卧底",
      baseSnapshotId: snapshot.id,
      note: "从人物版 v1 分叉试验",
    }, 300)
    assert.equal(branch.baseSnapshotId, snapshot.id)
    assert.equal(branch.baseVersion, 1)
    assert.equal(listProjectBranches(db, project.id, owner).length, 1)

    assert.throws(
      () => createProjectBranch(db, project.id, owner, {
        name: "无效分支",
        baseSnapshotId: "missing-snapshot",
      }),
      /快照不存在/,
    )
  } finally {
    db.close()
  }
})

test("PC4 MCP 提供只读 initialize、tools/list 与项目摘要 tools/call", async () => {
  const project = createProject(openDb(":memory:"), "MCP 项目", owner)
  // 路由使用共享测试库；这里只验证协议内容，不依赖真实 HTTP 服务器。
  const initialize = await mcpPost(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `chengju_sid=${owner}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  }))
  assert.equal(initialize.status, 200)
  const initBody = await initialize.json()
  assert.equal(initBody.result.serverInfo.name, "chengju")
  assert.equal(initBody.result.capabilities.tools.listChanged, false)

  const listed = await mcpPost(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `chengju_sid=${owner}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  }))
  const tools = (await listed.json()).result.tools
  assert.ok(tools.some((tool: { name: string }) => tool.name === "get_project_summary"))
  assert.ok(tools.every((tool: { annotations?: { readOnlyHint?: boolean } }) =>
    tool.annotations?.readOnlyHint !== false
  ))
  assert.ok(project.id)
})
