import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { ONBOARDING_STEPS } from "../lib/workspace-onboarding.ts"

test("ONB1 空项目引导用六步真实产出解释工作流", () => {
  assert.deepEqual(ONBOARDING_STEPS.map((step) => step.label), [
    "核心人物",
    "三幕大纲",
    "分集剧情",
    "角色定妆",
    "场次剧本",
    "分镜与视频",
  ])
  assert.equal(ONBOARDING_STEPS.length, 6)
  assert.ok(ONBOARDING_STEPS.every((step) => step.output.length > 0))
})

test("ONB2 空项目首屏只提供三个真实起点", () => {
  const source = fs.readFileSync("components/WorkspaceOnboarding.tsx", "utf8")

  assert.match(source, /一句成戏，先看一场/)
  assert.match(source, /人物、分镜与首帧自动完成/)
  assert.match(source, /导入小说或剧本/)
  assert.match(source, /查看示例项目/)
  assert.match(source, /ONBOARDING_STEPS/)
  assert.doesNotMatch(source, /第一次使用/)
  assert.doesNotMatch(source, /当前工作/)
  assert.doesNotMatch(source, /项目脉搏/)
  assert.doesNotMatch(source, /最近产物/)
})

test("ONB3 WorkspaceHome 只在空项目进入首次使用态", () => {
  const home = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")

  assert.match(home, /!hasExistingContent/)
  assert.match(home, /<WorkspaceOnboarding/)
  assert.match(home, /onOpenSource/)
  assert.match(page, /onOpenSource=/)
})

test("ONB4 设计规范记录空项目与返回项目使用不同首页", () => {
  const design = fs.readFileSync("DESIGN.md", "utf8")
  assert.match(design, /空项目首次使用态/)
  assert.match(design, /渐进披露/)
  assert.match(design, /已有内容后恢复「继续创作」/)
})

test("ONB5 空项目以一句想法为主入口，并明确快速创作和分步制作", () => {
  const source = fs.readFileSync("components/WorkspaceOnboarding.tsx", "utf8")

  assert.match(source, /写一句故事/)
  assert.match(source, /快速创作/)
  assert.match(source, /分步制作/)
  assert.match(source, /TARGETS/)
  assert.match(source, /fetchQuickCreationQuotes/)
  assert.match(source, /额度/)
  assert.match(source, /开始快速创作/)
  assert.match(source, /textarea/)
})

test("ONB6 快速试片建立 1 集生产计划并立即生成核心人物", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const home = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")

  assert.match(page, /async function startQuickTrial/)
  assert.match(page, /mode:\s*"sample"/)
  assert.match(page, /targetEpisodes:\s*1/)
  assert.match(page, /currentStage:\s*"characters"/)
  assert.match(home, /onStartQuickTrial/)
})

test("ONB8 快速试片自动生成人物、三幕和第一集并显示进度", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const progress = fs.readFileSync("components/QuickTrialProgress.tsx", "utf8")

  assert.match(page, /type QuickTrialPhase/)
  assert.match(page, /\/api\/characters/)
  assert.match(page, /\/api\/acts/)
  assert.match(page, /\/api\/episodes/)
  assert.match(page, /setQuickTrial\(\{\s*phase:\s*["']acts["']/)
  assert.match(page, /setQuickTrial\(\{\s*phase:\s*["']episodes["']/)
  assert.match(page, /setQuickTrial\(\{\s*phase:\s*["']ready["']/)
  assert.match(page, /<QuickTrialProgress/)
  assert.match(progress, /核心人物/)
  assert.match(progress, /三幕大纲/)
  assert.match(progress, /第一集/)
})

test("ONB7 分步制作只带入想法，不提前建计划或消耗额度", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const home = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")

  assert.match(page, /function startGuidedCreation/)
  assert.match(page, /setIdea\(guidedIdea\)/)
  assert.match(page, /goToStep\(["']characters["']\)/)
  assert.match(home, /onStartGuided/)
})

test("ONB9 首次入口只保留一句想法、一个主动作和渐进披露", () => {
  const source = fs.readFileSync("components/WorkspaceOnboarding.tsx", "utf8")
  const css = fs.readFileSync("app/workspace-shell.css", "utf8")

  assert.match(source, /useState<QuickCreationTarget>\("keyframe"\)/)
  assert.match(source, /wfx-onboarding-primary/)
  assert.match(source, /wfx-onboarding-support/)
  assert.match(source, /<details/)
  assert.match(source, /更多起点/)
  assert.match(source, /event\.ctrlKey/)
  assert.match(source, /event\.metaKey/)
  assert.match(source, /event\.key === "Enter"/)
  assert.doesNotMatch(source, /Ctrl \//)
  assert.match(source, /预计/)
  assert.doesNotMatch(source, /className="wfx-onboarding-preview"/)
  assert.doesNotMatch(source, /className="wfx-onboarding-launch"/)
  assert.match(css, /\.wfx-onboarding-primary/)
  assert.match(css, /\.wfx-onboarding-support/)
})

test("ONB10 快速创作进度收敛为可理解的三到四个宏阶段", () => {
  const progress = fs.readFileSync("components/QuickTrialProgress.tsx", "utf8")

  assert.match(progress, /macroSteps/)
  assert.match(progress, /故事骨架/)
  assert.match(progress, /视觉定妆/)
  assert.match(progress, /镜头视频/)
  assert.match(progress, /wfx-quick-trial-bar/)
  assert.doesNotMatch(progress, /const STEPS:/)
})

test("ONB11 首次入口删除重复眉标、解释段和二次预算摘要", () => {
  const source = fs.readFileSync("components/WorkspaceOnboarding.tsx", "utf8")

  assert.match(source, /一句成戏，先看一场/)
  assert.match(source, /人物、分镜与首帧自动完成/)
  assert.match(source, /写一句故事/)
  assert.doesNotMatch(source, /一句话开始，自己决定做到哪里/)
  assert.doesNotMatch(source, /主角遇到什么，最想让人看下去/)
  assert.doesNotMatch(source, /其他结构由系统先补全/)
  assert.doesNotMatch(source, /你会在第一次拿到/)
  assert.doesNotMatch(source, /wfx-onboarding-selection/)
})
