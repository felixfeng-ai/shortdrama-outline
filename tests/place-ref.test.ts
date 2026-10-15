import { test } from "node:test"
import assert from "node:assert/strict"

import { buildPlaceImagePrompt } from "../lib/assets/anchors.ts"
import { normalizeShots } from "../lib/assets/normalize.ts"
import type { VisualPlace } from "../lib/assets/types.ts"

// ── E18-E19 场景参考图 ──
//
// 地点锚点是**文本**，它让模型知道这个房间长什么样；场景参考图是它的下一半——
// 把「长什么样」直接喂给图像模型，比文字更硬。
//
// 和角色参考图同构：图台账里多一档归属（place），镜头整形时把该地点的图
// 并进「本镜参考图」，用户照单执行时才知道这一镜要多带一张房间图。

function place(over: Partial<VisualPlace> = {}): VisualPlace {
  return {
    id: "p1", name: "玻璃厂熔炉车间",
    space: "高挑空的车间，两排老式熔炉",
    props: "控制台上的工艺记录本",
    lighting: "顶部单排白炽灯",
    grade: "冷青底子，炉口偏橙",
    anchor: "space: 高挑空的车间，两排老式熔炉, lighting: 顶部单排白炽灯",
    ...over,
  }
}

const rawShot = (over: Record<string, unknown> = {}) => ({
  scene: "玻璃厂熔炉车间·深夜", characters: ["简南"], action: "巡检",
  shotSize: "全景", camera: "移",
  prompt: "Jianan walks along the furnace workshop at night",
  ...over,
})

test("E18 场景图提示词由地点锚点派生，且明确要求空场景", () => {
  const p = buildPlaceImagePrompt(place())
  assert.ok(p.includes("space: 高挑空的车间"), "没有带上地点锚点")
  assert.ok(/no people|empty|without people/i.test(p), "没有说明要空场景——出图时会站一堆人")
})

test("E18b 锚点为空时不编造，返回空串（宁可不给，也不能给一句废话）", () => {
  assert.equal(buildPlaceImagePrompt(place({ anchor: "" })), "")
})

test("E19 地点参考图并进本镜参考图，带地点名前缀", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot({ place: "玻璃厂熔炉车间" })] },
    visuals: [], stamp: 1,
    placeMap: new Map([["玻璃厂熔炉车间", place().anchor]]),
    placeRefMap: new Map([["玻璃厂熔炉车间", ["场景图"]]]),
  })
  assert.deepEqual(shots[0].refImages, ["玻璃厂熔炉车间·场景图"])
})

test("E19b 地点没有参考图时，参考图清单不受影响（不静默塞空项）", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot({ place: "玻璃厂熔炉车间" })] },
    visuals: [], stamp: 1,
  })
  assert.deepEqual(shots[0].refImages, [])
})

test("E19c 角色图与地点图并存时两组都在，顺序是角色在前", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot({ place: "玻璃厂熔炉车间" })] },
    visuals: [], stamp: 1,
    refMap: new Map([["简南", ["定妆正面"]]]),
    placeMap: new Map([["玻璃厂熔炉车间", place().anchor]]),
    placeRefMap: new Map([["玻璃厂熔炉车间", ["场景图"]]]),
  })
  assert.deepEqual(shots[0].refImages, ["简南·定妆正面", "玻璃厂熔炉车间·场景图"])
})

test("E19d 地点不在已知清单里时，它的图也不会被错误并进来", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot({ place: "隔壁咖啡馆" })] },
    visuals: [], stamp: 1,
    placeRefMap: new Map([["玻璃厂熔炉车间", ["场景图"]]]),
  })
  assert.deepEqual(shots[0].refImages, [])
})
