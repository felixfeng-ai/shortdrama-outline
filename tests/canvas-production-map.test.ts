import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { buildProductionMap } from "../lib/production-map.ts"

test("PM1 按集、场、镜分组，未标集置顶，场内保持原始顺序", () => {
  const map = buildProductionMap({
    episodes: [
      { id: "ep1", episode: 1, title: "第 1 集 · 雨夜来信" },
      { id: "ep2", episode: 2, title: "第 2 集 · 旧车票" },
    ],
    scenes: [
      { id: "sc1", episode: 1, scene: "旧楼门口", title: "第 1 场 · 旧楼门口", meta: "夜 · 苏婉" },
      { id: "sc2", episode: 1, scene: "客厅", title: "第 2 场 · 客厅", meta: "夜 · 陈默" },
      { id: "sc3", episode: 2, scene: "天台", title: "第 1 场 · 天台", meta: "清晨 · 苏婉" },
    ],
    shots: [
      { id: "s2", episode: 1, scene: "旧楼门口", shotNumber: 2, title: "第 2 镜", missing: true },
      { id: "s1", episode: 1, scene: "旧楼门口", shotNumber: 1, title: "第 1 镜" },
      { id: "s3", episode: 1, scene: "客厅", shotNumber: 3, title: "第 3 镜" },
      { id: "s4", episode: 2, scene: "天台", shotNumber: 1, title: "第 1 镜" },
      { id: "s0", episode: 0, scene: "", shotNumber: 1, title: "未标集镜头" },
    ],
  })

  assert.deepEqual(map.episodes.map((episode) => episode.number), [0, 1, 2])
  assert.equal(map.episodes[0].label, "未标集")
  const episodeOne = map.episodes[1]
  assert.equal(episodeOne.scenes.length, 2)
  assert.equal(episodeOne.scenes[0].title, "第 1 场 · 旧楼门口")
  assert.deepEqual(episodeOne.scenes[0].shots.map((shot) => shot.id), ["s2", "s1"])
  assert.equal(episodeOne.scenes[1].shots[0].id, "s3")
  assert.equal(episodeOne.missingCount, 1)
  assert.equal(episodeOne.shotCount, 3)
})

test("PM2 没有场次资料的镜头进入未标场次，不丢失也不编造地点", () => {
  const map = buildProductionMap({
    episodes: [{ id: "ep1", episode: 1, title: "第 1 集" }],
    scenes: [],
    shots: [
      { id: "a", episode: 1, scene: "临时地点", shotNumber: 1, title: "第 1 镜" },
      { id: "b", episode: 1, scene: "", shotNumber: 2, title: "第 2 镜" },
    ],
  })

  const scenes = map.episodes[0].scenes
  assert.equal(scenes.length, 2)
  assert.ok(scenes.some((scene) => scene.title.includes("临时地点")))
  assert.ok(scenes.some((scene) => scene.title.includes("未标场次")))
})

test("PM3 汇总真实镜头、场次、缺失与总时长", () => {
  const map = buildProductionMap({
    episodes: [{ id: "ep1", episode: 1, title: "第 1 集", missing: true }],
    scenes: [{ id: "sc1", episode: 1, scene: "客厅", title: "第 1 场 · 客厅" }],
    shots: [
      { id: "a", episode: 1, scene: "客厅", shotNumber: 1, title: "第 1 镜", duration: 5, missing: true },
      { id: "b", episode: 1, scene: "客厅", shotNumber: 2, title: "第 2 镜", duration: 10, status: "rework" },
    ],
  })

  assert.deepEqual(map.totals, {
    episodes: 1,
    scenes: 1,
    shots: 2,
    missing: 2,
    duration: 15,
  })
  assert.equal(map.episodes[0].scenes[0].duration, 15)
})

test("PM4 空项目不制造集场镜", () => {
  assert.deepEqual(buildProductionMap({ episodes: [], scenes: [], shots: [] }), {
    episodes: [],
    totals: { episodes: 0, scenes: 0, shots: 0, missing: 0, duration: 0 },
  })
})

test("PM5 画布接入双视图、真实关键帧与工作台定位", () => {
  const canvas = fs.readFileSync("components/ProjectCanvas.tsx", "utf8")
  const production = fs.existsSync("components/ProductionMap.tsx")
    ? fs.readFileSync("components/ProductionMap.tsx", "utf8")
    : ""
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.ok(canvas.includes("mapMode"))
  assert.ok(canvas.includes("制作地图"))
  assert.ok(canvas.includes("六步流程"))
  assert.ok(canvas.includes("<ProductionMap"))
  assert.ok(canvas.includes("generationAssets"))
  assert.ok(production.includes("buildProductionMap"))
  assert.ok(production.includes("selectedAt"))
  assert.ok(production.includes("downloadUrl"))
  assert.ok(production.includes("<img"))
  assert.ok(production.includes("待出图"))
  assert.ok(production.includes("onOpenShot"))
  assert.ok(css.includes(".production-map"))
  assert.ok(css.includes(".production-episode-tabs"))
  assert.ok(css.includes(".production-scene"))
  assert.ok(css.includes(".production-shot"))
  assert.ok(css.includes("min-height: 44px"))
})
