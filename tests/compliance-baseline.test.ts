import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("COMP1 生成图界面和下载响应明确标记 AI 生成", () => {
  const panel = fs.readFileSync("components/KeyframePanel.tsx", "utf8")
  const route = fs.readFileSync("app/api/generated-assets/[id]/route.ts", "utf8")
  assert.ok(panel.includes("AI 生成"))
  assert.match(route, /X-AI-Generated/)
})

test("COMP2 项目包包含可审计的 AI 来源清单", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(page.includes("ai-provenance.json"))
  assert.ok(page.includes("providerId"))
  assert.ok(page.includes("model"))
})

test("COMP3 隐私、条款、内容规则和举报入口可访问", () => {
  const legal = fs.readFileSync("app/legal/page.tsx", "utf8")
  const report = fs.readFileSync("app/report/page.tsx", "utf8")
  const skill = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  const login = fs.readFileSync("components/LoginPanel.tsx", "utf8")
  assert.ok(legal.includes("隐私"))
  assert.ok(legal.includes("内容规则"))
  assert.ok(report.includes("举报"))
  assert.ok(skill.includes('href="/legal"'))
  assert.ok(skill.includes('href="/report"'))
  assert.ok(login.includes('href="/legal"'))
})

test("COMP4 原文提交前明确保存位置与版权责任", () => {
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  assert.ok(catalog.includes("原文会保存到当前项目"))
  assert.ok(catalog.includes("请勿提交无权使用的作品"))
})

test("COMP5 Agent 文档链接不硬编码内部仓库地址", () => {
  const rich = fs.readFileSync("components/AgentRichText.tsx", "utf8")
  assert.ok(!rich.includes("github.com/felixfeng-ai"))
  assert.ok(rich.includes("NEXT_PUBLIC_PROJECT_REPO_URL"))
})
