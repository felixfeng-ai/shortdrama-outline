import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { buildProductionCanvasModel } from "../lib/production/canvas.ts"
import { createProductionPlanSeed } from "../lib/production/planner.ts"

test("CANVAS1 生产画布从真实项目事实派生节点与缺口", () => {
  const plan = createProductionPlanSeed({
    projectType: "drama",
    mode: "sample",
    targetEpisodes: 3,
  })
  const model = buildProductionCanvasModel({
    plan,
    counts: {
      characters: 3,
      episodes: 2,
      scenes: 5,
      shots: 12,
      images: 8,
      videos: 3,
      stale: 2,
      blocked: 1,
    },
  })

  assert.deepEqual(model.nodes.map((node) => node.key), [
    "characters",
    "episodes",
    "scenes",
    "shots",
    "images",
    "videos",
    "delivery",
  ])
  assert.equal(model.nodes.find((node) => node.key === "episodes")?.status, "active")
  assert.equal(model.nodes.find((node) => node.key === "episodes")?.missing, 1)
  assert.equal(model.nodes.find((node) => node.key === "shots")?.count, 12)
  assert.equal(model.summary.stale, 2)
  assert.equal(model.summary.blocked, 1)
})

test("CANVAS2 生产画布默认打开，自由画布保留为高级切换", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const canvas = fs.readFileSync("components/ProductionCanvas.tsx", "utf8")
  const switcher = fs.readFileSync("components/CanvasViewSwitch.tsx", "utf8")

  assert.match(page, /useState<CanvasWorkspaceView>\("production"\)/)
  assert.match(page, /<CanvasViewSwitch/)
  assert.match(page, /<ProductionCanvas/)
  assert.match(page, /<CanvasGraphWorkspace/)
  assert.match(canvas, /<ProductionMap/)
  assert.match(switcher, /生产画布/)
  assert.match(switcher, /自由画布/)
})

test("CANVAS3 生产画布与自由画布共享项目、镜头和阶段上下文", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const canvas = fs.readFileSync("components/ProductionCanvas.tsx", "utf8")

  assert.match(page, /projectId=\{projectId\}/)
  assert.match(page, /onOpenShot=\{\(shotId\) => openCanvasItem\("shots", shotId\)\}/)
  assert.match(canvas, /productionPlan/)
  assert.match(canvas, /onShowFlow/)
})
