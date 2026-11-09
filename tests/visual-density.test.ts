import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("VD1 项目状态条默认只保留高频入口，低频信息与零值不再平铺", () => {
  const workMeta = fs.readFileSync("components/WorkMeta.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.match(workMeta, /更多/)
  assert.match(workMeta, /workmeta-more-panel/)
  assert.match(workMeta, /aria-controls="workmeta-more-panel"/)
  assert.doesNotMatch(workMeta, /待办 \{todoCount\}/)
  assert.match(css, /\.workmeta-more-panel\s*\{/)
})

test("VD2 技能页把执行准备收进默认折叠项，并排在推荐之后", () => {
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  const css = fs.readFileSync("app/skills/skills.css", "utf8")

  assert.match(catalog, /preflightOpen/)
  assert.match(catalog, /<details[^>]*className="intake-preflight"/s)
  assert.match(catalog, /<summary>/)
  assert.match(catalog, /执行准备/)
  assert.match(catalog, /创作方法 · 可控执行/)
  assert.doesNotMatch(catalog, /CREATIVE METHODS \/ CONTROLLED RUNS/)
  assert.ok(
    catalog.indexOf('className="skill-recommendations"') <
      catalog.indexOf('className="intake-preflight"'),
    "执行准备应排在推荐之后",
  )
  assert.match(css, /\.skill-page \.intake-preflight summary\s*\{/)
  assert.match(css, /\.skill-page \.intake-preflight-grid\s*\{/)
})

test("VD3 教程使用中文眉标，并把正文、列表和图示说明提升到可读字号", () => {
  const guide = fs.readFileSync("components/DocsGuide.tsx", "utf8")
  const css = fs.readFileSync("app/docs/docs.css", "utf8")

  assert.match(guide, /可控短剧生产 · 约 8 分钟/)
  assert.doesNotMatch(guide, /QUICK START · ABOUT 8 MIN/)
  assert.doesNotMatch(guide, /01 \/ PLATFORM MAP/)
  assert.match(guide, /15 · 常见问题/)
  assert.match(css, /\.docs-section-kicker\s*\{[^}]*font-size:\s*11px/s)
  assert.match(css, /\.docs-steps p\s*\{[^}]*font-size:\s*13px/s)
  assert.match(css, /\.docs-checklist li\s*\{[^}]*font-size:\s*13px/s)
  assert.match(css, /\.docs-figure figcaption ol\s*\{[^}]*font-size:\s*12\.5px/s)
})
