import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { buildRepairAnchorsPreview } from "../lib/rework/preview.ts"
import type { Shot, VisualCharacter, VisualPlace } from "../lib/assets/types.ts"
import type { GeneratedAsset } from "../lib/generation/types.ts"

const baseShot = {
  id: "shot-1",
  entityId: "entity-1",
  episode: 1,
  scene: "客厅",
  shot: 1,
  place: "客厅",
  characters: ["苏婉"],
  prompt: "苏婉看向门口",
  status: "done",
} as Shot

const visuals = [{
  id: "visual-1",
  entityId: "character-1",
  name: "苏婉",
  anchor: "SU WAN, short black hair",
} as VisualCharacter]

const places = [{
  id: "place-1",
  name: "客厅",
  anchor: "OLD APARTMENT LIVING ROOM",
} as VisualPlace]

const asset = {
  id: "asset-1",
  targetType: "shot",
  targetId: "entity-1",
  selectedAt: Date.now(),
  createdAt: Date.now(),
} as GeneratedAsset

test("IP1 预览统计真实受影响集、场、镜头和已出图数量", () => {
  const preview = buildRepairAnchorsPreview({
    shots: [
      baseShot,
      { ...baseShot, id: "shot-2", entityId: "entity-2", episode: 2, scene: "客厅" },
    ],
    visuals,
    places,
    assets: [asset],
  })

  assert.deepEqual(preview.shotIds, ["entity-1", "entity-2"])
  assert.equal(preview.episodeCount, 2)
  assert.equal(preview.sceneCount, 2)
  assert.equal(preview.shotCount, 2)
  assert.equal(preview.selectedImageShots, 1)
  assert.equal(preview.estimatedCostMicros, 0)
})

test("IP2 总览先预览后写入，取消不调用返修接口", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const dialog = fs.readFileSync("components/ImpactPreviewDialog.tsx", "utf8")

  assert.match(page, /buildRepairAnchorsPreview/)
  assert.match(page, /setReworkPreview/)
  assert.match(page, /handleConfirmReworkPreview/)
  assert.match(page, /<ImpactPreviewDialog/)
  assert.match(dialog, /不调用模型/)
  assert.match(dialog, /不扣创作额度/)
  assert.match(dialog, /生成新分镜版本/)
})
