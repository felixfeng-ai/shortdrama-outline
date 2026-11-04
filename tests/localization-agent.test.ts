import { test } from "node:test"
import assert from "node:assert/strict"

import { POST as mcpPost } from "../app/api/mcp/route.ts"
import { AGENT_TOOL_SCHEMAS, createToolExecutors, type AgentState } from "../lib/agent/tools.ts"
import { EMPTY_BRIEF } from "../lib/brief.ts"

const owner = `anon_${"r".repeat(48)}`

function state(over: Partial<AgentState> = {}): AgentState {
  return {
    projectTitle: "出海项目",
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
    localizationBranches: [{
      id: "branch-en",
      name: "English",
      market: "US",
      locale: "en-US",
      status: "active",
    }],
    localizationContext: {
      branchId: "branch-en",
      market: "US",
      locale: "en-US",
      platforms: ["TikTok", "ReelShort"],
      audience: "北美 25-35 女性",
      strategy: "保留钩子，改写文化梗",
    },
    localizationAudit: {
      blocking: 1,
      warning: 2,
      issues: ["锁定术语缺失", "字幕超长", "招牌可读文字"],
    },
    localizationEntities: [{
      type: "episode",
      id: "ep-3",
      name: "第 3 集",
    }],
    ...over,
  }
}

test("LAG1 Agent 可读分支、上下文和最新审计", () => {
  const executors = createToolExecutors(state())
  assert.ok(AGENT_TOOL_SCHEMAS.some((tool) => tool.name === "list_localization_branches"))
  assert.ok(AGENT_TOOL_SCHEMAS.some((tool) => tool.name === "get_localization_context"))
  const branches = executors.list_localization_branches({})
  assert.match(branches.content, /English/)
  assert.match(branches.content, /en-US/)
  const context = executors.get_localization_context({ branchId: "branch-en" })
  assert.match(context.content, /北美 25-35 女性/)
  assert.match(context.content, /TikTok/)
  assert.match(context.content, /锁定术语缺失/)
})

test("LAG2 本地化修改只生成待确认卡，不直接改内容", () => {
  const executors = createToolExecutors(state())
  assert.ok(AGENT_TOOL_SCHEMAS.some((tool) => tool.name === "propose_localization_edit"))
  const result = executors.propose_localization_edit({
    branchId: "branch-en",
    targetType: "episode",
    targetId: "ep-3",
    newText: "Lin Yuan makes a choice that costs him the only witness.",
    summary: "强化第三集结尾代价",
  })
  assert.equal(result.ok, true)
  assert.equal(result.card?.kind, "localization-edit")
  if (result.card?.kind === "localization-edit") {
    assert.equal(result.card.branchId, "branch-en")
    assert.equal(result.card.targetName, "第 3 集")
  }
  assert.equal(state().localizationBranches?.length, 1)
})

test("LAG3 MCP 工具列表包含只读本地化摘要", async () => {
  const response = await mcpPost(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `chengju_sid=${owner}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }))
  const tools = (await response.json()).result.tools
  const localization = tools.find((tool: { name: string }) =>
    tool.name === "get_localization_summary"
  )
  assert.ok(localization)
  assert.equal(localization.annotations.readOnlyHint, true)
})
