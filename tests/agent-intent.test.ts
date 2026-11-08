import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  buildAgentIntentSystemBlock,
  detectAgentIntent,
} from "../lib/agent/intent.ts"
import { POST as detectIntentRoute } from "../app/api/agent/intent/route.ts"

test("INTENT1 快速出片与长剧改编不会混进同一执行链", () => {
  const quick = detectAgentIntent("用一句话生成一个 10 秒的视频")
  const drama = detectAgentIntent("把这部小说改编成 30 集短剧")

  assert.equal(quick.intent, "quick_video")
  assert.equal(drama.intent, "drama_from_source")
  assert.equal(drama.requiresProject, true)
})

test("INTENT2 继续制作、质量检查和画布编排各有独立意图", () => {
  assert.equal(detectAgentIntent("继续做第 12 集分镜").intent, "drama_continue")
  assert.equal(detectAgentIntent("检查人物连续性、缺图和过期镜头").intent, "production_review")
  assert.equal(detectAgentIntent("在自由画布上连接三个生成节点").intent, "canvas_orchestration")
})

test("INTENT3 营销请求不会误走短剧阶段", () => {
  const result = detectAgentIntent("帮我策划小红书投放素材和三条广告变体")
  assert.equal(result.intent, "marketing_plan")
  assert.equal(result.projectType, "marketing")
})

test("INTENT4 意图系统块明确写入边界和推荐动作", () => {
  const block = buildAgentIntentSystemBlock(detectAgentIntent("从剧本生成样片"))
  assert.match(block, /drama_from_source/)
  assert.match(block, /不得覆盖/)
  assert.match(block, /样片/)
})

test("INTENT5 Agent 输入区显示当前意图，API 返回统一信封", async () => {
  const dock = fs.readFileSync("components/AgentDock.tsx", "utf8")
  const badge = fs.readFileSync("components/AgentIntentBadge.tsx", "utf8")
  assert.match(dock, /AgentIntentBadge/)
  assert.match(badge, /detectAgentIntent/)
  assert.match(badge, /intent\.label/)
  assert.equal(detectAgentIntent("快速出片").label, "快速创作")
  assert.equal(detectAgentIntent("把剧本改编成短剧").label, "小说 / 剧本改编")

  const response = await detectIntentRoute(new Request("http://localhost/api/agent/intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "继续完成第 3 集镜头" }),
  }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.success, true)
  assert.equal(payload.data.intent.intent, "drama_continue")
})
