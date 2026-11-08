import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { PRODUCTION_MODE_PRESETS } from "../lib/production/presets.ts"

test("PRODUI1 项目类型选择只新增短剧，旧快速出片转为兼容提示", () => {
  const source = fs.readFileSync("components/ProjectTypePicker.tsx", "utf8")
  assert.doesNotMatch(source, /value:\s*["']quick_video["']/)
  assert.match(source, /快速出片/)
  assert.match(source, /短剧生产/)
  assert.match(source, /营销视频/)
  assert.match(source, /项目类型/)
})

test("PRODUI2 生产档位显示真实范围并允许填写目标集数", () => {
  const source = fs.readFileSync("components/ProductionModePicker.tsx", "utf8")
  assert.equal(PRODUCTION_MODE_PRESETS.sample.label, "样片验证")
  assert.equal(PRODUCTION_MODE_PRESETS.batch.label, "小批生产")
  assert.equal(PRODUCTION_MODE_PRESETS.season.label, "整季生产")
  assert.match(source, /PRODUCTION_MODE_PRESETS/)
  assert.match(source, /targetEpisodes/)
  assert.match(source, /aria-pressed/)
})

test("PRODUI3 阶段首页展示模式、当前阶段、进度和下一步", () => {
  const source = fs.readFileSync("components/ProductionStageHeader.tsx", "utf8")
  assert.match(source, /modeLabel/)
  assert.match(source, /PRODUCTION_MODE_PRESETS/)
  assert.match(source, /当前阶段/)
  assert.match(source, /下一阶段/)
  assert.match(source, /production-stage-track/)
  assert.match(source, /episodeCount/)
})

test("PRODUI4 WorkspaceHome 接入生产设置和阶段头，而不是新增独立后台页", () => {
  const home = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")
  assert.match(home, /<ProductionStageHeader/)
  assert.match(home, /productionPlan/)
  assert.match(home, /productionProjectType/)
  assert.match(home, /productionMode/)
  assert.match(home, /onCreateProductionPlan/)
})

test("PRODUI5 主工作区加载并持久化项目生产计划", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const client = fs.readFileSync("lib/production/client.ts", "utf8")
  assert.match(client, /fetchProductionPlan/)
  assert.match(client, /createProductionPlan/)
  assert.match(client, /updateProductionPlan/)
  assert.match(client, /extendProductionPlan/)
  assert.match(page, /fetchProductionPlan/)
  assert.match(page, /createProjectProductionPlan/)
  assert.match(page, /productionPlan/)
  assert.match(page, /onOpenProductionStage/)
})

test("PRODUI6 生产首页沿用确认稿的石墨工作台视觉 token", () => {
  const css = fs.readFileSync("app/workspace-shell.css", "utf8")
  assert.match(css, /\.production-setup/)
  assert.match(css, /\.production-stage-track/)
  assert.match(css, /\.production-mode-option/)
  assert.match(css, /var\(--wfx-line\)/)
  assert.match(css, /var\(--wfx-accent\)/)
})

test("PRODUI7 生产首页提供无损晋级且只提交已有集号", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const header = fs.readFileSync("components/ProductionStageHeader.tsx", "utf8")
  const client = fs.readFileSync("lib/production/client.ts", "utf8")

  assert.match(header, /onPromote/)
  assert.match(header, /晋级/)
  assert.match(page, /extendProductionPlan/)
  assert.match(page, /existingEpisodeNumbers:\s*episodes\.map/)
  assert.match(client, /production\/extend/)
})

test("PRODUI8 已有内容时先显示轻量迁移建议，完整设置按需展开", () => {
  const home = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")
  const header = fs.readFileSync("components/ProductionStageHeader.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const css = fs.readFileSync("app/workspace-shell.css", "utf8")

  assert.match(home, /hasExistingContent/)
  assert.match(header, /production-migration/)
  assert.match(header, /采用建议/)
  assert.match(header, /调整设置/)
  assert.match(header, /buildProductionPlanSuggestion/)
  assert.match(page, /PRODUCTION_MODE_PRESETS\.sample\.defaultEpisodes/)
  assert.match(css, /\.production-migration/)
  assert.match(css, /padding-right:\s*92px/)
})

test("PRODUI9 总览页头不再提供重复编排画布入口", () => {
  const home = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")
  const design = fs.readFileSync("DESIGN.md", "utf8")

  assert.doesNotMatch(home, /<CanvasIcon/)
  assert.doesNotMatch(home, /编排画布/)
  assert.doesNotMatch(home, /onOpenCanvas/)
  assert.match(design, /总览页头只保留「继续当前步骤」一个主操作/)
  assert.match(design, /画布入口由顶部「画布」模式承担/)
})
