import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { buildShotWorkbenchTree, filterShotsForWorkbench } from "../lib/shots.ts"
import type { Shot } from "../lib/assets/types.ts"

function shot(patch: Partial<Shot> = {}): Shot {
  return {
    id: "shot-1",
    entityId: "entity-1",
    shot: 1,
    episode: 1,
    scene: "天台·夜",
    characters: ["林远"],
    action: "推门",
    speaker: "",
    dialogue: "",
    place: "天台",
    shotSize: "中景",
    camera: "固定",
    prompt: "prompt",
    refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: false },
    status: "todo",
    ...patch,
  }
}

test("WORKBENCH1 集场镜树按集、连续场次和镜头稳定组织", () => {
  const tree = buildShotWorkbenchTree([
    shot({ id: "a", shot: 1, episode: 2, scene: "走廊" }),
    shot({ id: "b", shot: 2, episode: 1, scene: "天台" }),
    shot({ id: "c", shot: 3, episode: 1, scene: "天台" }),
    shot({ id: "d", shot: 4, episode: 1, scene: "办公室" }),
    shot({ id: "e", shot: 5, episode: 0, scene: "未标注" }),
  ])

  assert.deepEqual(tree.map((episode) => episode.episode), [0, 1, 2])
  assert.deepEqual(tree[1].scenes.map((scene) => scene.label), ["天台", "办公室"])
  assert.deepEqual(tree[1].scenes[0].shots.map((item) => item.id), ["b", "c"])
  assert.equal(tree[1].shotCount, 3)
})

test("WORKBENCH2 集与场次筛选互斥且不自动猜测未标注集", () => {
  const shots = [
    shot({ id: "a", episode: 1, scene: "天台" }),
    shot({ id: "b", episode: 1, scene: "办公室" }),
    shot({ id: "c", episode: 2, scene: "天台" }),
    shot({ id: "d", episode: 0, scene: "未标注" }),
  ]
  assert.deepEqual(filterShotsForWorkbench(shots, 1, "办公室").map((item) => item.id), ["b"])
  assert.deepEqual(filterShotsForWorkbench(shots, 0, null).map((item) => item.id), ["d"])
  assert.deepEqual(filterShotsForWorkbench(shots, null, null).map((item) => item.id), ["a", "b", "c", "d"])
})

test("WORKBENCH3 分镜列表接入树、卡流与批次面板", () => {
  const list = fs.readFileSync("components/ShotList.tsx", "utf8")
  assert.ok(list.includes("shot-workbench"))
  assert.ok(list.includes("shot-tree"))
  assert.ok(list.includes("ShotBoardCard"))
  assert.ok(list.includes("buildShotWorkbenchTree"))
  assert.ok(list.includes("fetchProjectGenerationAssets"))
  assert.ok(list.includes("scene"))
  assert.ok(list.includes("shot"))
})

test("WORKBENCH4 右侧舱提供镜头属性页签并复用关键帧生成器", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const inspector = fs.readFileSync("components/ShotInspector.tsx", "utf8")
  assert.ok(page.includes("镜头属性"))
  assert.ok(page.includes("<ShotInspector"))
  assert.ok(inspector.includes("<KeyframePanel"))
  assert.ok(inspector.includes("本镜 Prompt"))
  assert.ok(inspector.includes("镜头执行参数"))
  assert.equal(inspector.includes("Provider"), false)
  assert.equal(inspector.includes("API Key"), false)
})
