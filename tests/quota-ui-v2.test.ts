import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const quotaBar = fs.readFileSync("components/QuotaBar.tsx", "utf8")
const sidebar = fs.readFileSync("components/WorkspaceSidebar.tsx", "utf8")
const page = fs.readFileSync("app/page.tsx", "utf8")
const api = fs.readFileSync("lib/assets/api.ts", "utf8")
const mobileContext = fs.readFileSync("app/api/mobile/context/route.ts", "utf8")
const mobileAgent = fs.readFileSync("app/api/mobile/agent/route.ts", "utf8")
const agentDock = fs.readFileSync("components/AgentDock.tsx", "utf8")
const skillDrawer = fs.readFileSync("components/SkillAgentDrawer.tsx", "utf8")
const keyframePanel = fs.readFileSync("components/KeyframePanel.tsx", "utf8")
const shotVideoPanel = fs.readFileSync("components/ShotVideoPanel.tsx", "utf8")
const batchVideoPanel = fs.readFileSync("components/BatchVideoPanel.tsx", "utf8")
const voicePanel = fs.readFileSync("components/VoiceProfilePanel.tsx", "utf8")
const timelinePanel = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")

test("QV2-UI1 额度组件按当前集数读取并解释余额", () => {
  assert.match(quotaBar, /fetchQuota\(episodeCount\)/)
  assert.match(quotaBar, /quota\.estimates\.selected/)
  assert.match(quotaBar, /集短剧/)
  assert.match(quotaBar, /addEventListener\('focus'/)
  assert.doesNotMatch(quotaBar, /1 个完整项目 = 13 单位/)
})

test("QV2-UI2 工作台把当前集数传给统一额度入口", () => {
  assert.match(sidebar, /episodeCount: number/)
  assert.match(sidebar, /<QuotaBar[^>]*episodeCount=\{episodeCount\}/s)
  assert.match(page, /<WorkspaceSidebar[^>]*episodeCount=\{episodeCount\}/s)
})

test("QV2-UI3 前端额度 DTO 提供统一估算与价格版本", () => {
  assert.match(api, /projectEstimate/)
  assert.match(api, /pricingVersion: string/)
  assert.match(api, /fetchQuota = \(episodeCount/)
})

test("QV2-UI4 移动端复用统一估算，不自行按 13 计算", () => {
  assert.match(mobileContext, /projectQuotaEstimates/)
  assert.match(mobileAgent, /projectQuotaEstimate/)
  assert.doesNotMatch(mobileContext, /Math\.floor\(quota\.remaining \/ FULL_PROJECT_COST\)/)
  assert.doesNotMatch(mobileAgent, /Math\.floor\(quota\.remaining \/ FULL_PROJECT_COST\)/)
})

test("QV2-UI5 普通 Agent 展示单轮预算与实际消耗", () => {
  assert.match(agentDock, /AGENT_CHAT_MAX_CALLS/)
  assert.match(agentDock, /本轮最多/)
  assert.match(agentDock, /上次消耗/)
  assert.match(agentDock, /maxModelCalls: AGENT_CHAT_MAX_CALLS/)
  assert.match(skillDrawer, /AGENT_CHAT_MAX_CALLS/)
  assert.doesNotMatch(agentDock, /单轮最多 6 次查询/)
})

test("QV2-UI6 媒体动作在提交前展示统一额度成本", () => {
  assert.match(keyframePanel, /IMAGE_GENERATION_UNITS/)
  assert.match(keyframePanel, /IMAGE_EDIT_UNITS/)
  assert.match(shotVideoPanel, /quotaUnitsForCostMicros/)
  assert.match(batchVideoPanel, /quotaUnitsForCostMicros/)
  assert.match(voicePanel, /quotaUnitsForCostMicros/)
  assert.match(timelinePanel, /RENDER_UNITS/)
})
