import { test } from "node:test"
import assert from "node:assert/strict"

import { buildScenePrompt, buildShotPrompt } from "../lib/assets/prompts.ts"

// ── 数量下限护栏 ──
//
// 这两步曾经都没有数量下限，模型就交最省事的结果：实测 10 集被拆成 10 场
// （每集 1 场），再拆成 17 镜（每场 1.7 镜），折合 85 秒成片——
// 而一部 10 集竖屏短剧需要 900 秒左右。
//
// 下限写在 prompt 里，改文案很容易顺手删掉，删掉之后不会有任何报错，
// 只是产出悄悄缩水回 15 个镜头。所以这几条断言盯的不是文案本身，
// 是「这两步还有没有数量下限」这件事。

const characters = [
  { id: "c1", name: "简南", identity: "技术科长", personality: "能忍", motivation: "拿回配方", arc: "掀桌子" },
]
const episodes = Array.from({ length: 10 }, (_, i) => ({
  id: `ep${i + 1}`, number: i + 1, title: `第 ${i + 1} 集`, synopsis: "剧情梗概", hook: "钩子",
}))
const scenes = Array.from({ length: 4 }, (_, i) => ({
  id: `sc${i + 1}`, number: i + 1, episode: 1, location: "办公室", timeOfDay: "夜",
  summary: "发生了一些事", characters: ["简南"],
}))

test("场次 prompt 带每集场次下限（没有它，10 集会被拆成 10 场）", () => {
  const { system } = buildScenePrompt("一个想法", characters, episodes)
  assert.ok(system.includes("数量要求"), "场次 prompt 缺「数量要求」小节")
  assert.ok(system.includes("至少拆出 4 场"), "场次 prompt 缺每集下限")
})

test("分镜 prompt 带每场镜头下限（没有它，每场只给 1-2 镜）", () => {
  const { system } = buildShotPrompt("一个想法", scenes as never, [])
  assert.ok(system.includes("数量要求"), "分镜 prompt 缺「数量要求」小节")
  assert.ok(system.includes("每一场戏必须拆出 2-5 个镜头"), "分镜 prompt 缺每场镜头下限")
})
