import { test } from "node:test"
import assert from "node:assert/strict"

import { buildProjectStatus, reviewEpisodes, reviewShots } from "../lib/project-status.ts"
import type { Act, Character, Episode } from "../lib/types.ts"
import type { Scene, Shot, VisualCharacter, VisualPlace } from "../lib/assets/types.ts"

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "s1",
    entityId: "s1",
    shot: 1,
    episode: 1,
    scene: "街口",
    characters: ["陈默"],
    action: "回头",
    speaker: "",
    dialogue: "",
    place: "街口",
    shotSize: "中景",
    camera: "固定",
    prompt: "a man",
    refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: false },
    status: "todo",
    ...over,
  }
}

test("分镜状态：缺图、返修与掉锚点使用同一套计数口径", () => {
  const review = reviewShots([
    shot({ id: "s1", shot: 1, missingRefFor: ["陈默"], status: "rework" }),
    shot({ id: "s2", shot: 2, status: "rework" }),
    shot({ id: "s3", shot: 3 }),
  ], 2)

  assert.equal(review.total, 3)
  assert.deepEqual(review.missing.map((s) => s.shot), [1])
  assert.deepEqual(review.missingNames, ["陈默"])
  assert.deepEqual(review.rework.map((s) => s.shot), [1, 2])
  assert.equal(review.problemCount, 2)
})

test("分集状态：空钩子与短钩子分别统计，但画布节点合并为待补数", () => {
  const episodes: Episode[] = [
    { id: "e1", number: 1, title: "一", synopsis: "", hook: "" },
    { id: "e2", number: 2, title: "二", synopsis: "", hook: "太短" },
    { id: "e3", number: 3, title: "三", synopsis: "", hook: "这个结尾钩子已经足够长，最后一秒的反转会让观众立刻点开下一集" },
  ]
  const review = reviewEpisodes(episodes)
  assert.deepEqual(review.empty.map((e) => e.number), [1])
  assert.deepEqual(review.short.map((e) => e.number), [2])
  assert.equal(review.problemCount, 2)
})

test("项目状态：画布缺口同时覆盖人物、定妆过期、场次、分镜与地点", () => {
  const characters: Character[] = [{
    id: "c1",
    name: "陈默",
    identity: "快递员",
    personality: "沉默",
    motivation: "拿回遗产",
    arc: "",
  }]
  const acts: Act[] = [
    { id: "a1", key: "setup", title: "铺垫", summary: "开端", beats: ["收到遗嘱"] },
    { id: "a2", key: "conflict", title: "冲突", summary: "争夺", beats: ["被阻拦"] },
  ]
  const episodes: Episode[] = [
    { id: "e1", number: 1, title: "一", synopsis: "", hook: "钩子" },
  ]
  const visuals: VisualCharacter[] = [{
    id: "v1",
    name: "陈默",
    age: "28",
    face: "窄脸",
    hair: "短发",
    marks: "",
    wardrobe: "夹克",
    props: "",
    anchor: "a 28-year-old man",
  }]
  const scenes: Scene[] = [{
    id: "sc1",
    number: 1,
    episode: 1,
    location: "旧宅",
    timeOfDay: "夜",
    summary: "",
    characters: ["陈默"],
  }]
  const places: VisualPlace[] = []

  const status = buildProjectStatus({
    characters,
    acts,
    episodes,
    visuals,
    scenes,
    places,
    shots: [shot({ missingRefFor: ["陈默"] })],
    expiredShots: 0,
    visualsStale: true,
  })

  assert.equal(status.issues.characters, 1)
  assert.equal(status.issues.acts, 1)
  assert.equal(status.issues.episodes, 1)
  assert.equal(status.issues.visuals, 1)
  assert.equal(status.issues.scenes, 1)
  assert.equal(status.issues.shots, 1)
  assert.equal(status.placeGaps, 1)
})
