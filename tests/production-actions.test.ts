import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { describeProductionAction } from "../lib/production-actions.ts"

test("PA1 三类修复项映射为明确动作和去向", () => {
  const expired = describeProductionAction({
    id: "expired-shots",
    text: "有 3 个镜头掉锚点",
    step: "shots",
    kind: "fix",
  })
  assert.equal(expired.label, "修复提示词")
  assert.equal(expired.step, "shots")
  assert.equal(expired.directFix, true)

  const missing = describeProductionAction({
    id: "missing-refs",
    text: "有 2 个镜头缺参考图",
    step: "visuals",
    kind: "fix",
  })
  assert.equal(missing.label, "去定妆挂图")
  assert.equal(missing.directFix, false)

  const rework = describeProductionAction({
    id: "rework-shots",
    text: "有 1 个镜头需返修",
    step: "shots",
    kind: "fix",
  })
  assert.equal(rework.label, "打开返修镜头")
  assert.equal(rework.filter, "issues")
})

test("PA2 总览接入动作中心并支持直接保存修复后的分镜", () => {
  const home = fs.readFileSync("components/WorkspaceHome.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const shotList = fs.readFileSync("components/ShotList.tsx", "utf8")
  const route = fs.readFileSync("app/api/projects/[id]/rework/batch/route.ts", "utf8")

  assert.match(home, /ProductionActionCenter/)
  assert.match(page, /applyProjectRework/)
  assert.match(page, /handleProductionAction/)
  assert.match(route, /persistEditedArtifact/)
  assert.match(shotList, /params\.get\(["']qc["']\)/)
})
