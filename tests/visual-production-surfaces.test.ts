import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const onboarding = fs.readFileSync("components/WorkspaceOnboarding.tsx", "utf8")
const skills = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
const canvas = fs.readFileSync("components/ProductionCanvas.tsx", "utf8")
const workspaceCss = fs.readFileSync("app/workspace-shell.css", "utf8")
const skillCss = fs.readFileSync("app/skills/skills.css", "utf8")

test("VISUAL1 首次创作页用真实封面和分类图标建立视觉层级", () => {
  assert.match(onboarding, /wfx-onboarding-showcase/)
  assert.match(onboarding, /\/visuals\/premium\/estate-rain\.webp/)
  assert.match(onboarding, /\/visuals\/premium\/umbrella-heir\.webp/)
  assert.match(onboarding, /wfx-onboarding-eyebrow/)
  assert.match(onboarding, /data-target=\{key\}/)
  assert.match(workspaceCss, /--wfx-gold:/)
  assert.match(workspaceCss, /wfx-onboarding-target-icon/)
  assert.doesNotMatch(onboarding, /\/skills\/continuity\.png/)
})

test("VISUAL2 创作技能页用缩略图和内容分类色替代纯文字推荐", () => {
  assert.match(skills, /skill-hero-showcase/)
  assert.match(skills, /skill-recommendation-media/)
  assert.match(skills, /skillTone\(/)
  assert.match(skillCss, /\.tone-story/)
  assert.match(skillCss, /\.tone-delivery/)
})

test("VISUAL3 空画布展示真实项目事实而不是通用节点插图", () => {
  assert.match(canvas, /production-canvas-facts/)
  assert.match(canvas, /当前项目事实/)
  assert.match(canvas, /确认制作范围/)
  assert.doesNotMatch(canvas, /EMPTY_CANVAS_NODES/)
  assert.match(workspaceCss, /production-canvas-fact-columns/)
})
