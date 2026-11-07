import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { applyShotRework } from "../lib/rework/plan.ts"
import type { Shot, VisualCharacter, VisualPlace } from "../lib/assets/types.ts"

const shot = {
  id: "shot-1",
  entityId: "entity-1",
  episode: 1,
  scene: "客厅",
  shot: 1,
  place: "客厅",
  characters: ["苏婉"],
  prompt: "苏婉回头看向门口",
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

test("RW1 批量返修只修改指定镜头的确定性锚点", () => {
  const result = applyShotRework({
    action: "repair-anchors",
    shots: [shot, { ...shot, id: "shot-2", entityId: "entity-2", prompt: "已完整" }],
    visuals,
    places,
    shotIds: ["entity-1"],
  })

  assert.deepEqual(result.changedIds, ["entity-1"])
  assert.match(result.shots[0].prompt, /SU WAN/)
  assert.equal(result.shots[0].status, "rework")
  assert.equal(result.shots[1].prompt, "已完整")
})

test("RW2 总览和分镜 QC 共用批量返修接口", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const shotList = fs.readFileSync("components/ShotList.tsx", "utf8")
  const client = fs.readFileSync("lib/rework/client.ts", "utf8")
  const route = fs.readFileSync("app/api/projects/[id]/rework/batch/route.ts", "utf8")

  assert.match(page, /applyProjectRework/)
  assert.match(shotList, /applyProjectRework/)
  assert.match(client, /rework\/batch/)
  assert.match(route, /persistEditedArtifact/)
  assert.match(route, /latestSnapshot/)
})
