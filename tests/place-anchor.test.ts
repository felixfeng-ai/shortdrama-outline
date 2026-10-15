import { test } from "node:test"
import assert from "node:assert/strict"

import { compilePlaceAnchor } from "../lib/assets/anchors.ts"
import { normalizePlaces, normalizeShots } from "../lib/assets/normalize.ts"
import type { VisualPlace } from "../lib/assets/types.ts"

// ── E16-E17 地点视觉锚点 ──
//
// 角色有一致性契约（六字段 + 锚点串逐镜注入），地点没有。后果是具体的：
// 「简南办公室」在第 2 镜可能是「an office with a cold desk lamp」，
// 在第 15 镜变成「a modern office with floor-to-ceiling windows」——
// 人物的脸保住了，房间每镜不一样。
//
// 而一部剧 40 场戏，真实地点可能只有 8-12 个在反复复用，复用率极高。

function place(over: Partial<VisualPlace> = {}): VisualPlace {
  return {
    id: "p1", name: "玻璃厂夜班车间",
    space: "老式车间，裸露水泥柱，两排熔炉",
    props: "角落一个封存的铁皮配方柜",
    lighting: "顶部单排白炽灯，夜间只留值班灯",
    grade: "冷青底子，炉火处偏橙",
    anchor: "", ...over,
  }
}

const placeMap = new Map([["玻璃厂夜班车间", compilePlaceAnchor(place())]])

const rawShot = (over: Record<string, unknown> = {}) => ({
  scene: "玻璃厂夜班车间·深夜", characters: ["简南"], action: "巡查",
  shotSize: "全景", camera: "移", prompt: "A technician walks through the workshop",
  ...over,
})

test("E16 地点锚点可编译，字段顺序固定、幂等", () => {
  const a = compilePlaceAnchor(place())
  assert.match(a, /^space: .*set dressing: .*lighting: .*color grade: .*$/)
  assert.equal(compilePlaceAnchor(place()), compilePlaceAnchor(place()))
})

test("E16b 空字段跳过，全空返回空串", () => {
  const a = compilePlaceAnchor(place({ props: "", lighting: "  " }))
  assert.ok(!a.includes("set dressing"), "空字段混进了锚点")
  assert.equal(compilePlaceAnchor(place({ space: "", props: "", lighting: "", grade: "" })), "")
})

test("E16c 地点整形：模型没给 anchor 时自动编译", () => {
  const places = normalizePlaces({ places: [{ name: "车间", space: "高挑空" }] })
  assert.equal(places.length, 1)
  assert.equal(places[0].anchor, "space: 高挑空")
})

test("E16d 地点整形：同名地点只保留一份（同一个房间不能有两份描述）", () => {
  const places = normalizePlaces({ places: [
    { name: "车间", space: "A" },
    { name: "车间", space: "B" },
  ] })
  assert.equal(places.length, 1, "同名地点被拆成了两份")
  assert.equal(places[0].space, "A", "应当保留先出现的那份")
})

test("E17 分镜带地点，且地点锚点逐镜注入", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot({ place: "玻璃厂夜班车间" })] },
    visuals: [], placeMap, stamp: 1,
  })
  assert.equal(shots[0].place, "玻璃厂夜班车间")
  assert.ok(shots[0].prompt.includes("space: 老式车间"), "地点锚点没有注入")
})

test("E17b 地点不在已知清单里就不注入（宁可没有，也不能挂错房间）", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot({ place: "隔壁咖啡馆" })] },
    visuals: [], placeMap, stamp: 1,
  })
  assert.equal(shots[0].place, "", "未知地点没有被清掉")
  assert.ok(!shots[0].prompt.includes("space:"), "未知地点竟然注入了别处的锚点")
})

test("E17c 模型没回 place 时是空串，不报错也不瞎猜", () => {
  const shots = normalizeShots({ raw: { shots: [rawShot()] }, visuals: [], placeMap, stamp: 1 })
  assert.equal(shots[0].place, "")
  assert.ok(!shots[0].prompt.includes("space:"))
})

test("E17d 没有 placeMap 时一切照旧（老数据与未生成地点的项目不受影响）", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot({ place: "玻璃厂夜班车间" })] },
    visuals: [], stamp: 1,
  })
  assert.equal(shots[0].place, "")
})

test("E17e 地点锚点只注入一次（幂等，重跑整形不会越注越多）", () => {
  const first = normalizeShots({
    raw: { shots: [rawShot({ place: "玻璃厂夜班车间" })] },
    visuals: [], placeMap, stamp: 1,
  })
  const twice = normalizeShots({
    raw: { shots: [{ ...rawShot({ place: "玻璃厂夜班车间" }), prompt: first[0].prompt }] },
    visuals: [], placeMap, stamp: 1,
  })
  assert.equal(twice[0].prompt.split("space: 老式车间").length - 1, 1, "锚点被注入了两次")
})
