import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("P2 成片相关提案卡在桌面与 Skill Agent 中都有真实落点", () => {
  const agent = fs.readFileSync("components/AgentDock.tsx", "utf8")
  const skill = fs.readFileSync("components/SkillAgentDrawer.tsx", "utf8")
  const system = fs.readFileSync("lib/agent/system.ts", "utf8")

  for (const kind of [
    "video-rework",
    "timeline-plan",
    "voice-plan",
    "tts-plan",
    "render-plan",
  ]) {
    assert.ok(agent.includes(kind), `桌面 Agent 缺少 ${kind}`)
    assert.ok(skill.includes(kind), `Skill Agent 缺少 ${kind}`)
  }
  assert.match(system, /audit_video_quality/)
  assert.match(system, /propose_episode_render/)
})

test("P2 成片渲染结束会发送 Web Push", () => {
  const service = fs.readFileSync("lib/video/render-service.ts", "utf8")
  assert.match(service, /notifyRenderFinished\(db, completed, "succeeded"\)/)
  assert.match(service, /notifyRenderFinished\(db, failed, "failed"\)/)
})
