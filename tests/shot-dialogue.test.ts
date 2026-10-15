import { test } from "node:test"
import assert from "node:assert/strict"

import { normalizeShots } from "../lib/assets/normalize.ts"
import { buildShotPrompt } from "../lib/assets/prompts.ts"
import { shotToWorkOrder, shotsToCsv, buildStoryboardHtml } from "../lib/assets/export.ts"
import type { Shot } from "../lib/assets/types.ts"

// ── E13-E14 台词 ──
//
// 为什么这是「洞」而不是「创作辅助」：拿判据量一遍——下游工具能自己填上吗？
// 音频剪映能做，剪辑剪映能做，但「这一镜谁说了什么」即梦不知道你的剧情、
// 剪映不认识你的角色，谁都填不上。而平台手里握着全部上下文。
//
// 所以平台只产**文本**：台词原文 + 说话人。音频仍然不碰（那是越线）。

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "s1", entityId: "e1", shot: 1, episode: 1, scene: "咖啡馆内·黄昏",
    characters: ["林远"], action: "推门", shotSize: "中景", camera: "固定",
    prompt: "a man in a sand jacket", refImages: [], missingRefFor: [],
    speaker: "", dialogue: "", place: "",
    params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo", ...over,
  }
}

const rawShot = (over: Record<string, unknown> = {}) => ({
  scene: "咖啡馆内·黄昏", characters: ["林远"], action: "推门",
  shotSize: "中景", camera: "固定", prompt: "a man in a sand jacket", ...over,
})

test("E13 分镜带上说话人与台词", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot({ speaker: "林远", dialogue: "你早就知道了。" })] },
    visuals: [], stamp: 1,
  })
  assert.equal(shots[0].speaker, "林远")
  assert.equal(shots[0].dialogue, "你早就知道了。")
})

test("E13b 纯画面镜头：两个字段是空串，不是 undefined（下游要能直接拼字符串）", () => {
  const shots = normalizeShots({ raw: { shots: [rawShot()] }, visuals: [], stamp: 1 })
  assert.equal(shots[0].speaker, "")
  assert.equal(shots[0].dialogue, "")
})

test("E13c 分镜 prompt 必须写死语速上限（不写死，模型会给你写一整段念不完的）", () => {
  const scenes = [{
    id: "sc1", number: 1, episode: 1, location: "咖啡馆", timeOfDay: "黄昏",
    summary: "相遇", characters: ["林远"],
  }]
  const { system } = buildShotPrompt("一个想法", scenes as never, [])
  assert.ok(system.includes("20 字"), "prompt 里没有单镜台词字数上限")
  assert.ok(system.includes("旁白"), "prompt 里没有说明旁白怎么标")
})

test("E14 执行单写出台词与说话人（照着念就能配音）", () => {
  const w = shotToWorkOrder(shot({ speaker: "林远", dialogue: "你早就知道了。" }))
  assert.ok(w.includes("你早就知道了。"), "执行单里没有台词")
  assert.ok(w.includes("林远"), "执行单里没有说话人")
})

test("E14b 没台词的镜头不写台词行（纯画面不硬塞空行）", () => {
  const w = shotToWorkOrder(shot())
  assert.ok(!w.includes("台词："), "纯画面镜头多写了一行空台词")
})

test("E14c prompts.csv 有说话人与台词列", () => {
  const csv = shotsToCsv([shot({ speaker: "林远", dialogue: "你早就知道了。" })])
  const head = csv.split("\n")[0]
  assert.ok(head.includes("说话人"), "CSV 缺说话人列")
  assert.ok(head.includes("台词"), "CSV 缺台词列")
  assert.ok(csv.includes("你早就知道了。"), "CSV 行里没有台词")
})

test("E14d 离线分镜表有台词列", () => {
  const html = buildStoryboardHtml({
    title: "测试剧", visuals: [], scenes: [],
    shots: [shot({ speaker: "林远", dialogue: "你早就知道了。" })],
  })
  assert.ok(html.includes("台词"), "离线分镜表缺台词列")
  assert.ok(html.includes("你早就知道了。"), "离线分镜表里没有台词")
})
