import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { normalizeShots } from "../lib/assets/normalize.ts"
import { buildShotPrompt } from "../lib/assets/prompts.ts"
import {
  planShotBatches,
  shotBatchLabel,
  shotTokenBudget,
} from "../lib/shots.ts"
import type { Scene, VisualCharacter } from "../lib/assets/types.ts"

const scenes: Scene[] = Array.from({ length: 18 }, (_, index) => ({
  id: `scene-${index}`,
  number: index + 1,
  episode: Math.floor(index / 4) + 1,
  location: `地点 ${index + 1}`,
  timeOfDay: "夜",
  summary: `第 ${index + 1} 场发生的事`,
  characters: ["林远"],
}))

const visuals: VisualCharacter[] = [{
  id: "visual-1",
  entityId: "char-lin",
  name: "林远",
  age: "32",
  face: "窄眼",
  hair: "短发",
  marks: "",
  wardrobe: "夹克",
  props: "",
  anchor: "age: 32; face: narrow eyes",
  lockedTraits: ["age", "face", "hair", "marks"],
}]

test("分镜按场次分批：40 场 -> 5 批，最后一批保留剩余场次", () => {
  const batches = planShotBatches(40)
  assert.equal(batches.length, 5)
  assert.deepEqual(batches[0], { index: 1, sceneStart: 1, sceneEnd: 8 })
  assert.deepEqual(batches[4], { index: 5, sceneStart: 33, sceneEnd: 40 })
  assert.match(shotBatchLabel(batches[1], 40), /第 2\/5 批/)
  assert.match(shotBatchLabel(batches[1], 40), /第 9-16 场/)
})

test("分镜 token 预算按批场上限控制，18 场和 40 场都不会按总场次线性暴涨", () => {
  assert.ok(shotTokenBudget(8) >= 6000)
  assert.ok(shotTokenBudget(8) <= 12000)
  assert.equal(shotTokenBudget(8), shotTokenBudget(18))
  assert.equal(shotTokenBudget(8), shotTokenBudget(40))
})

test("分镜 prompt 明确本批场次范围并承接前批镜头摘要", () => {
  const { system, user } = buildShotPrompt(
    "快递员",
    scenes.slice(8, 16),
    visuals,
    [],
    undefined,
    undefined,
    undefined,
    {
      sceneStart: 9,
      sceneTotal: 18,
      previous: ["第 7 镜：林远在门口停住", "第 8 镜：门内传来响声"].join("\n"),
    },
  )
  assert.match(system, /本批只拆第 9-16 场/)
  assert.match(system, /全片共 18 场/)
  assert.match(system, /不要重复/)
  assert.match(user, /第 7 镜：林远在门口停住/)
})

test("跨批整形镜号与 entityId 连续，不会从 1 重新开始", () => {
  const raw = {
    shots: [
      { scene: "门外", action: "停住", prompt: "stop outside" },
      { scene: "门内", action: "听见", prompt: "hear a sound" },
    ],
  }
  const first = normalizeShots({ raw, visuals, stamp: 100, offset: 0 })
  const second = normalizeShots({ raw, visuals, stamp: 100, offset: first.length })
  assert.deepEqual(first.map((shot) => shot.shot), [1, 2])
  assert.deepEqual(second.map((shot) => shot.shot), [3, 4])
  assert.deepEqual(second.map((shot) => shot.entityId), ["shot-e-2", "shot-e-3"])
  assert.notEqual(second[0].id, first[0].id)
})

test("分镜接口接入分批规划、累计批次进度和最终一次性落库", () => {
  const route = fs.readFileSync("app/api/shots/route.ts", "utf8")
  assert.ok(route.includes("planShotBatches"))
  assert.ok(route.includes("sceneStart"))
  assert.ok(route.includes("shotBatchLabel"))
  assert.ok(route.includes("persistIfProject"))
})
