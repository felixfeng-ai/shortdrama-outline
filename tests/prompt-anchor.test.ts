import { test } from "node:test"
import assert from "node:assert/strict"

import { buildShotPrompt } from "../lib/assets/prompts.ts"
import { normalizeShots } from "../lib/assets/normalize.ts"
import type { Scene, VisualCharacter } from "../lib/assets/types.ts"

// ── E15 不再要求模型嵌锚点 ──
//
// 实测观察到的现象（10 集 → 40 场 → 68 镜那次）：
// 一条 prompt 里同一个人被描述了两遍——先是模型把锚点改写成英文
// （"A female technician in a sand-colored cotton short jacket..."），
// 然后是 injectAnchor 判定「未包含」，又把原文追加了一遍。
//
// 根因不是 injectAnchor，是**要求模型「一字不改地复制」本身就不合理**：
// 它做不到逐字，只会改写。所以修的是指令——让模型只写画面（动作/环境/光线/景别/运镜/风格），
// 外貌一律由系统注入。
//
// 两个代价，第二个才是真正的风险：
//   1. token 翻倍（我们在 maxTokens 上刚栽过跟头）
//   2. 模型改写的内容可能和注入的原文**冲突**——模型写「米色外套」、
//      系统注入「沙色短夹克」，出图时听谁的？这直接伤跨镜头一致性。
//
// injectAnchor 保持原样：它从「主要手段」降级成「安全网」——
// 模型万一还是写了外貌，逐字锚点照样进得去（见 shots.test.ts 的 B5i）。

const scenes: Scene[] = [{
  id: "sc1", number: 1, episode: 1, location: "玻璃厂车间", timeOfDay: "夜",
  summary: "简南夜班巡查", characters: ["简南"],
}]

const visuals: VisualCharacter[] = [{
  id: "v1", name: "简南", age: "34岁", face: "偏长脸", hair: "黑色短发",
  marks: "左眉尾浅疤", wardrobe: "沙色棉质短夹克", props: "钴蓝色硬壳笔记本",
  anchor: "age: 34岁, wearing: 沙色棉质短夹克",
}]

test("E15 分镜 prompt 不再要求模型「原样嵌入」锚点", () => {
  const { system } = buildShotPrompt("一个想法", scenes, visuals)
  assert.ok(
    !system.includes("必须原样嵌入"),
    "还留着「必须原样嵌入」——模型做不到逐字，这个指令只会招来改写",
  )
  assert.ok(
    !system.includes("一字不改地复制"),
    "还留着「一字不改地复制」，同理",
  )
})

test("E15b 明确禁止模型写外貌（这才是重复的根源）", () => {
  const { system } = buildShotPrompt("一个想法", scenes, visuals)
  assert.ok(system.includes("不要写角色的外貌"), "没有明确禁止写外貌")
})

test("E15c 告诉模型怎么指代角色（不说清楚，它就只剩外貌可写）", () => {
  const { system } = buildShotPrompt("一个想法", scenes, visuals)
  assert.ok(/指代|姓名/.test(system), "没有给出指代角色的写法")
})

test("E15d 安全网还在：模型万一还是写了外貌，逐字锚点照样注入", () => {
  // 这是 shots.test.ts B5i 的同一条保证，这里再钉一次，
  // 因为改 prompt 时最容易顺手把 injectAnchor 一起「优化」掉
  const shots = normalizeShots({
    raw: { shots: [{
      scene: "玻璃厂车间", characters: ["简南"], action: "巡查",
      shotSize: "全景", camera: "移",
      prompt: "A female technician in a sand-colored cotton short jacket walks through the workshop",
    }] },
    visuals, stamp: 1,
  })
  assert.ok(shots[0].prompt.includes("age: 34岁"), "逐字锚点必须仍然注入")
})
