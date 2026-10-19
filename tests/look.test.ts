import { test } from "node:test"
import assert from "node:assert/strict"

import { EMPTY_LOOK, isLookEmpty, lookPromptBlock, lookSignature, readLook } from "../lib/look.ts"
import { buildShotPrompt } from "../lib/assets/prompts.ts"
import type { Scene, VisualCharacter } from "../lib/assets/types.ts"
import type { Act } from "../lib/types.ts"

const scenes: Scene[] = [
  { id: "s1", episode: 1, number: 1, location: "铁门外", timeOfDay: "夜", summary: "陈默站着", characters: ["陈默"] },
]
const visuals: VisualCharacter[] = [
  { id: "v1", name: "陈默", age: "29", face: "瘦", hair: "短", marks: "", wardrobe: "雨衣", props: "", anchor: "a thin man" },
]
const acts: Act[] = [{ id: "a1", key: "setup", title: "第一幕", summary: "接到遗产", beats: [] }]

test("L1 空视觉宪法不产生 prompt 片段", () => {
  assert.equal(lookPromptBlock(EMPTY_LOOK), "")
  assert.equal(lookPromptBlock(undefined), "")
  assert.equal(isLookEmpty(EMPTY_LOOK), true)
})

test("L2 四个字段进入 prompt 块", () => {
  const block = lookPromptBlock({
    palette: "冷蓝、低饱和",
    light: "单一暖光源",
    lens: "长焦压缩",
    banned: "不要霓虹",
  })
  assert.match(block, /色调：冷蓝、低饱和/)
  assert.match(block, /光线：单一暖光源/)
  assert.match(block, /镜头语言：长焦压缩/)
  assert.match(block, /不要出现：不要霓虹/)
})

test("L3 分镜 prompt：空 look 与不传完全一致，有 look 则注入", () => {
  const base = buildShotPrompt("快递员", scenes, visuals, acts)
  const empty = buildShotPrompt("快递员", scenes, visuals, acts, undefined, undefined, EMPTY_LOOK)
  assert.equal(base.system, empty.system)

  const withLook = buildShotPrompt("快递员", scenes, visuals, acts, undefined, undefined, {
    ...EMPTY_LOOK,
    palette: "冷蓝",
  })
  assert.match(withLook.system, /视觉宪法/)
  assert.match(withLook.system, /色调：冷蓝/)
})

test("L4 字段清洗与签名", () => {
  const look = readLook({ palette: "  冷蓝  ", light: 1, lens: "长焦" })
  assert.equal(look.palette, "冷蓝")
  assert.equal(look.light, "")
  assert.notEqual(lookSignature({ ...EMPTY_LOOK, palette: "冷蓝" }), lookSignature({ ...EMPTY_LOOK, palette: "暖黄" }))
})
