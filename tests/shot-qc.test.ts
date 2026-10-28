import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  auditShotProduction,
  repairShotAnchors,
} from "../lib/assets/qc.ts"
import { placeGenerationTargetId } from "../lib/assets/anchors.ts"
import type { Shot, VisualCharacter, VisualPlace } from "../lib/assets/types.ts"
import type { GeneratedAsset } from "../lib/generation/types.ts"

const visual: VisualCharacter = {
  id: "v1",
  entityId: "character-linyuan",
  name: "林远",
  age: "29岁",
  face: "长脸",
  hair: "黑色短发",
  marks: "左眉浅疤",
  wardrobe: "沙色夹克",
  props: "钥匙",
  anchor: "age: 29岁, face: 长脸, hair: 黑色短发, marks: 左眉浅疤",
  lockedTraits: ["age", "face", "hair", "marks"],
}

const place: VisualPlace = {
  id: "place-1",
  name: "旧仓库",
  space: "水泥柱",
  props: "铁皮柜",
  lighting: "冷白顶灯",
  grade: "青灰",
  anchor: "space: 水泥柱, lighting: 冷白顶灯",
}

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "shot-row-1",
    entityId: "shot-entity-1",
    shot: 1,
    episode: 1,
    scene: "旧仓库",
    characters: ["林远"],
    action: "推门",
    speaker: "",
    dialogue: "",
    place: "旧仓库",
    shotSize: "中景",
    camera: "固定",
    prompt: "cinematic still",
    refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false },
    status: "todo",
    ...over,
  }
}

function asset(
  targetType: GeneratedAsset["targetType"],
  targetId: string,
  createdAt: number,
  selectedAt: number | null = createdAt + 1,
): GeneratedAsset {
  return {
    id: `${targetType}-${targetId}-${createdAt}`,
    taskId: `task-${createdAt}`,
    projectId: "project-1",
    targetType,
    targetId,
    storageKey: `mock/${targetType}-${createdAt}.png`,
    mime: "image/png",
    bytes: 100,
    providerId: "aliyun",
    model: "mock",
    prompt: "mock",
    selectedAt,
    createdAt,
    downloadUrl: `/api/generated-assets/${targetType}-${targetId}-${createdAt}`,
  }
}

test("QC1 缺锚点、禁改项、缺图和不支持时长都进入同一镜头质检", () => {
  const result = auditShotProduction({
    shots: [shot({
      prompt: "cinematic still, age: 29岁",
      missingRefFor: ["林远"],
      params: { ratio: "9:16", duration: 7, lastFrame: false },
    })],
    visuals: [visual],
    places: [place],
    assets: [],
  })[0]

  assert.equal(result.needsRepair, true)
  assert.ok(result.issues.some((issue) => issue.code === "missing-anchor"))
  assert.ok(result.issues.some((issue) => issue.code === "locked-trait"))
  assert.ok(result.issues.some((issue) => issue.code === "missing-reference"))
  assert.ok(result.issues.some((issue) => issue.code === "invalid-duration"))
})

test("QC2 旧参考只在镜头采用图早于当前角色/地点采用图时报告", () => {
  const results = auditShotProduction({
    shots: [
      shot(),
      shot({ id: "shot-row-2", entityId: "shot-entity-2", shot: 2 }),
      shot({ id: "shot-row-3", entityId: "shot-entity-3", shot: 3 }),
      shot({ id: "shot-row-4", entityId: "shot-entity-4", shot: 4 }),
    ],
    visuals: [visual],
    places: [place],
    assets: [
      asset("shot", "shot-entity-1", 100),
      asset("character", "character-linyuan", 200),
      asset("place", placeGenerationTargetId(place.name), 300),
      asset("shot", "shot-entity-2", 400),
      asset("character", "character-linyuan", 450),
      asset("shot", "shot-entity-4", 500),
      asset("character", "character-linyuan", 100, 600),
    ],
  })

  assert.deepEqual(results[0].staleReferences.sort(), ["林远", "旧仓库"].sort())
  assert.deepEqual(results[1].staleReferences, ["林远"])
  assert.deepEqual(results[2].staleReferences, [])
  assert.deepEqual(results[3].staleReferences, ["林远"])
})

test("QC3 确定性修复补齐角色与地点锚点，已出图镜头转需返修", () => {
  const repaired = repairShotAnchors(
    shot({ status: "done" }),
    [visual],
    [place],
  )
  assert.ok(repaired.prompt.includes(visual.anchor))
  assert.ok(repaired.prompt.includes(place.anchor))
  assert.equal(repaired.status, "rework")

  const clean = shot({ prompt: `${visual.anchor}, ${place.anchor}`, status: "done" })
  const unchanged = repairShotAnchors(clean, [visual], [place])
  assert.equal(unchanged.prompt, clean.prompt)
  assert.equal(unchanged.status, "done")
})

test("QC4 制作工作台显示问题标签、问题筛选与批量返修入口", () => {
  const shotList = fs.readFileSync("components/ShotList.tsx", "utf8")
  const card = fs.readFileSync("components/ShotBoardCard.tsx", "utf8")
  const inspector = fs.readFileSync("components/ShotInspector.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")

  assert.ok(shotList.includes("auditShotProduction"))
  assert.ok(shotList.includes("仅看问题"))
  assert.ok(shotList.includes("修复提示词"))
  assert.ok(shotList.includes("标记旧参考返修"))
  assert.ok(card.includes("qc"))
  assert.ok(card.includes("缺锚点"))
  assert.ok(card.includes("旧参考"))
  assert.ok(inspector.includes("镜头质检"))
  assert.ok(page.includes("visuals={visuals}"))
  assert.ok(page.includes("places={places}"))
})
