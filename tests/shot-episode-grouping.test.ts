import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import type { Shot } from "../lib/assets/types.ts"
import { groupShotsByEpisode } from "../lib/shots.ts"

function shot(patch: Partial<Shot>): Shot {
  return {
    id: "shot-1",
    entityId: "shot-e-1",
    shot: 1,
    episode: 1,
    scene: "天台·夜",
    characters: [],
    action: "",
    speaker: "",
    dialogue: "",
    place: "天台",
    shotSize: "中景",
    camera: "固定",
    prompt: "",
    refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: false },
    status: "todo",
    ...patch,
  }
}

test("SEG1 分镜按集聚合：未标注在前，余下按集升序，组内保持原顺序", () => {
  const groups = groupShotsByEpisode([
    shot({ id: "s2a", shot: 2, episode: 2 }),
    shot({ id: "s1a", shot: 1, episode: 1 }),
    shot({ id: "s0", shot: 3, episode: 0 }),
    shot({ id: "s2b", shot: 4, episode: 2 }),
  ])

  assert.deepEqual(groups.map((group) => group.episode), [0, 1, 2])
  assert.deepEqual(groups[2].shots.map((item) => item.id), ["s2a", "s2b"])
})

test("SEG2 集级摘要统计镜头、时长、缺图和返修", () => {
  const groups = groupShotsByEpisode([
    shot({ id: "a", episode: 3, missingRefFor: ["林远"], status: "rework", params: { ratio: "9:16", duration: 10, lastFrame: false } }),
    shot({ id: "b", episode: 3, params: { ratio: "9:16", duration: 5, lastFrame: false } }),
    shot({ id: "c", episode: 3, missingRefFor: ["苏婉"], params: { ratio: "9:16", duration: 10, lastFrame: false } }),
  ])

  assert.equal(groups[0].shotCount, 3)
  assert.equal(groups[0].durationSeconds, 25)
  assert.equal(groups[0].missingRefShots, 2)
  assert.equal(groups[0].reworkShots, 1)
})

test("SEG3 集内连续同场次归段，场景标签变化另起一段", () => {
  const groups = groupShotsByEpisode([
    shot({ id: "a", episode: 1, scene: "天台·夜" }),
    shot({ id: "b", episode: 1, scene: "天台·夜" }),
    shot({ id: "c", episode: 1, scene: "办公室·日" }),
    shot({ id: "d", episode: 1, scene: "天台·夜" }),
  ])

  assert.deepEqual(groups[0].scenes.map((scene) => scene.label), ["天台·夜", "办公室·日", "天台·夜"])
  assert.deepEqual(groups[0].scenes.map((scene) => scene.shots.map((item) => item.id)), [
    ["a", "b"],
    ["c"],
    ["d"],
  ])
})

test("SEG4 分镜列表渲染集头、摘要、场次段和集号下拉", () => {
  const list = fs.readFileSync("components/ShotList.tsx", "utf8")
  const inspector = fs.readFileSync("components/ShotInspector.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")

  assert.ok(list.includes("groupShotsByEpisode"), "分镜列表没有按集分组")
  assert.ok(list.includes("shot-board-episode"), "缺少卡流集头")
  assert.ok(list.includes("durationSeconds"), "缺少每集时长摘要")
  assert.ok(list.includes("未标注"), "缺少未标注分组")
  assert.ok(list.includes("shot-board-scene-head"), "缺少场次分段")
  assert.ok(inspector.includes("episodeCount"), "镜头检查器没有可选集数范围")
  assert.ok(inspector.includes(">所属集<"), "镜头检查器缺少集号选择器")
  assert.ok(page.includes("episodeCount={episodeCount}"), "页面没有把总集数传给制作台")
})
