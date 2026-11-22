import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { getPublicVideoCapabilities } from "../lib/video/model.ts"

const capabilities = getPublicVideoCapabilities({
  VIDEO_GENERATION_ENABLED: "1",
  MINIMAX_API_KEY: "server-only",
  MINIMAX_VIDEO_MODEL: "MiniMax-H3-Lite",
  MINIMAX_VIDEO_RESOLUTION: "768P",
})

test("P4-A 试片、标准、成片三档只推荐兼容能力和组合", async () => {
  const catalogPath = "lib/video/catalog.ts"
  const source = fs.readFileSync(catalogPath, "utf8")
  assert.match(source, /recommendVideoSelection/)
  const catalog = await import("../lib/video/catalog.ts") as typeof import("../lib/video/catalog.ts") & {
    recommendVideoSelection?: (input: {
      capabilities: typeof capabilities
      duration: number
      goal: "draft" | "standard" | "final"
      budgetLimitMicros?: number
    }) => {
      model: string
      resolution: string
      estimatedCostMicros: number
      goal: string
      reason: string
      overBudget: boolean
    }
  }
  assert.equal(typeof catalog.recommendVideoSelection, "function")

  const draft = catalog.recommendVideoSelection!({
    capabilities,
    duration: 10,
    goal: "draft",
  })
  const standard = catalog.recommendVideoSelection!({
    capabilities,
    duration: 10,
    goal: "standard",
  })
  const final = catalog.recommendVideoSelection!({
    capabilities,
    duration: 10,
    goal: "final",
  })
  const budgeted = catalog.recommendVideoSelection!({
    capabilities,
    duration: 10,
    goal: "standard",
    budgetLimitMicros: 2_000_000,
  })
  const overBudget = catalog.recommendVideoSelection!({
    capabilities,
    duration: 10,
    goal: "final",
    budgetLimitMicros: 1_000_000,
  })

  assert.deepEqual(
    { model: draft.model, resolution: draft.resolution },
    { model: "MiniMax-H3-Lite", resolution: "480P" },
  )
  assert.deepEqual(
    { model: standard.model, resolution: standard.resolution },
    { model: "MiniMax-H3-Lite", resolution: "768P" },
  )
  assert.deepEqual(
    { model: final.model, resolution: final.resolution },
    { model: "MiniMax-H3", resolution: "2K" },
  )
  assert.equal(budgeted.estimatedCostMicros <= 2_000_000, true)
  assert.equal(overBudget.overBudget, true)
  assert.match(overBudget.reason, /预算/)
  assert.equal(draft.estimatedCostMicros, 1_600_000)
  assert.equal(standard.estimatedCostMicros, 2_600_000)
  assert.equal(final.estimatedCostMicros, 8_000_000)
})

test("P4-B 单镜设置自动应用推荐，同时允许手动覆盖", () => {
  const settings = fs.readFileSync("components/VideoGenerationSettings.tsx", "utf8")
  const hook = fs.readFileSync("lib/video/use-video-capabilities.ts", "utf8")
  const shot = fs.readFileSync("components/ShotVideoPanel.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.match(settings, /recommendVideoSelection/)
  assert.match(settings, /试片/)
  assert.match(settings, /标准/)
  assert.match(settings, /成片/)
  assert.match(settings, /智能推荐/)
  assert.match(settings, /使用推荐/)
  assert.match(settings, /onApplySelection/)
  assert.match(hook, /setSelection/)
  assert.match(shot, /onApplySelection/)
  assert.match(css, /\.video-generation-routing/)
})

test("P4-C 浏览器 E2E 验证标准与成片自动匹配", () => {
  const script = fs.readFileSync("scripts/verify-core-production.mjs", "utf8")

  assert.match(script, /智能推荐/)
  assert.match(script, /成片/)
  assert.match(script, /MiniMax-H3-Lite/)
  assert.match(script, /MiniMax-H3/)
  assert.match(script, /2K/)
  assert.match(script, /video-routing-desktop\.png/)
  assert.match(script, /video-routing-mobile\.png/)
})
