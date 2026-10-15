import { test } from "node:test"
import assert from "node:assert/strict"

import { shotsToChainingList } from "../lib/assets/export.ts"
import type { Shot } from "../lib/assets/types.ts"

// ── E7-E9 首尾帧衔接清单 ──
//
// 即梦/可灵的首尾帧模式需要「首帧 + 尾帧」两张图，中间过渡由模型补。
// 同一场戏里相邻的两镜，把上一镜的尾帧交给下一镜当首帧，衔接就是模型算出来的，
// 而不是剪辑台上硬切出来的。
//
// 这几条测试盯住的是「这份清单能不能照着执行」，不是解析：
// 勾了谁、从哪一帧接、导出叫什么名字、哪里可能接不上。

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "s1", entityId: "e1", shot: 1, episode: 1, scene: "简南办公室·夜",
    characters: ["简南"], action: "推门", speaker: "", dialogue: "", place: "",
    shotSize: "中景", camera: "固定",
    prompt: "a woman in a sand jacket, cinematic",
    refImages: ["简南·定妆正面"], missingRefFor: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo", ...over,
  }
}

test("E7 勾了「接下一镜首帧」的镜头，与它的下一镜构成一处衔接", () => {
  const list = shotsToChainingList([
    shot({ id: "s1", shot: 1, params: { ratio: "9:16", duration: 5, lastFrame: true } }),
    shot({ id: "s2", shot: 2, prompt: "a woman turns to the window" }),
  ])
  assert.ok(list.includes("第 1 镜 → 第 2 镜"), "没有列出衔接对")
  assert.ok(list.includes("共 1 处衔接"), "衔接总数不对")
})

test("E7b 没勾的镜头不会被臆造成衔接（不替用户做决定）", () => {
  const list = shotsToChainingList([
    shot({ id: "s1", shot: 1 }),
    shot({ id: "s2", shot: 2 }),
  ])
  assert.ok(list.includes("共 0 处衔接"), "未勾选却产生了衔接")
  assert.ok(!list.includes("第 1 镜 → 第 2 镜"))
})

test("E7c 一个都没勾时给的是说明，不是一片空白", () => {
  const list = shotsToChainingList([])
  assert.ok(list.includes("共 0 处衔接"))
  assert.ok(list.includes("接下一镜首帧"), "没告诉用户去哪里勾")
})

test("E7d 衔接只认勾选的发起镜，数量与涉及镜号都对得上", () => {
  const list = shotsToChainingList([
    shot({ id: "s1", shot: 1, params: { ratio: "9:16", duration: 5, lastFrame: true } }),
    shot({ id: "s2", shot: 2, params: { ratio: "9:16", duration: 5, lastFrame: true } }),
    shot({ id: "s3", shot: 3 }),
  ])
  assert.ok(list.includes("共 2 处衔接"), "两处衔接没数对")
  assert.ok(list.includes("3 个镜头"), "涉及镜头数没数对")
})

test("E8 帧交接要写清方向与导出文件名（照着做就能执行）", () => {
  const list = shotsToChainingList([
    shot({ id: "s1", shot: 1, params: { ratio: "9:16", duration: 5, lastFrame: true } }),
    shot({ id: "s2", shot: 2 }),
  ])
  assert.ok(list.includes("尾帧"), "没写尾帧从哪来")
  assert.ok(list.includes("首帧"), "没写下一镜的首帧用什么")
  assert.ok(list.includes("最后一帧"), "没说尾帧从成片的哪个位置导出")
  assert.ok(list.includes("chaining/第01镜-末帧.png"), "缺导出文件名建议")
})

test("E8b 下一镜的提示词要带出来（提交时不用回头找）", () => {
  const list = shotsToChainingList([
    shot({ id: "s1", shot: 1, params: { ratio: "9:16", duration: 5, lastFrame: true } }),
    shot({ id: "s2", shot: 2, prompt: "a woman turns to the window, cold light" }),
  ])
  assert.ok(list.includes("a woman turns to the window, cold light"), "下一镜的提示词丢了")
})

test("E9 最后一镜勾了衔接：没有下一镜，必须提示而不是静默跳过", () => {
  const list = shotsToChainingList([
    shot({ id: "s1", shot: 1 }),
    shot({ id: "s2", shot: 2, params: { ratio: "9:16", duration: 5, lastFrame: true } }),
  ])
  assert.ok(list.includes("最后一镜"), "末镜勾选没有提示")
  assert.ok(!list.includes("第 2 镜 →"), "没有下一镜却写了衔接对")
})

test("E9b 跨场景衔接要提示（同场戏才该接，跨场通常硬切）", () => {
  const list = shotsToChainingList([
    shot({ id: "s1", shot: 1, scene: "咖啡馆内·黄昏", params: { ratio: "9:16", duration: 5, lastFrame: true } }),
    shot({ id: "s2", shot: 2, scene: "天台·深夜" }),
  ])
  assert.ok(list.includes("场景标签不同"), "跨场景没提示")
  assert.ok(list.includes("咖啡馆内·黄昏") && list.includes("天台·深夜"), "没写清是哪两个场景")
})

test("E9c 下一镜缺参考图要提示（首帧接不上，去了平台才发现代价更大）", () => {
  const list = shotsToChainingList([
    shot({ id: "s1", shot: 1, params: { ratio: "9:16", duration: 5, lastFrame: true } }),
    shot({ id: "s2", shot: 2, refImages: [], missingRefFor: ["陈默"] }),
  ])
  assert.ok(list.includes("缺"), "缺图没提示")
  assert.ok(list.includes("陈默"), "没写清是谁缺图")
})
