import { test } from "node:test"
import assert from "node:assert/strict"

import { buildTodoList } from "../lib/todo.ts"

// ── T1 项目待办：把「散在六个分区里的状态」收成一张清单 ──
//
// 起因：六步分屏之后，用户看得见当前这一步，看不见「整个项目还有哪些没处理」。
// 缺参考图、提示词掉锚点、自己标了返修——这三件事原本要一屏一屏翻才发现。
//
// 这张清单只做两件事：说出该做什么、给一个去处。它不写任何东西。

const done = { characters: true, acts: true, episodes: true, visuals: true, scenes: true, shots: true }
const shot = (over: { shot?: number; missingRefFor?: string[]; status?: string } = {}) => ({
  shot: over.shot ?? 1,
  missingRefFor: over.missingRefFor ?? [],
  status: over.status ?? "todo",
})

test("T1 空项目：给一条「从哪开始」的引导，指向第一步", () => {
  const list = buildTodoList({
    completed: { ...done, characters: false, acts: false, episodes: false, visuals: false, scenes: false, shots: false },
    shots: [],
    expiredShots: 0,
  })
  assert.equal(list.length, 1)
  assert.equal(list[0].kind, "next")
  assert.equal(list[0].step, "characters")
  assert.match(list[0].text, /故事灵感|写下想法/)
})

test("T1b 主链的下一步用短标签指出来（人物做完就指三幕）", () => {
  const list = buildTodoList({
    completed: { ...done, acts: false, episodes: false, visuals: false, scenes: false, shots: false },
    shots: [],
    expiredShots: 0,
  })
  assert.equal(list[0].kind, "next")
  assert.equal(list[0].step, "acts")
  assert.match(list[0].text, /三幕大纲/)
})

test("T2 缺参考图的镜头被列出来，并带上角色名", () => {
  const list = buildTodoList({
    completed: done,
    shots: [shot({ shot: 2, missingRefFor: ["陈默"] }), shot({ shot: 5, missingRefFor: ["苏婉", "陈默"] })],
    expiredShots: 0,
  })
  const item = list.find((i) => i.id === "missing-refs")
  assert.ok(item, "缺参考图没有出现在待办里")
  assert.equal(item!.step, "visuals", "该去定妆那儿挂图")
  assert.match(item!.text, /2 个镜头/)
  assert.match(item!.text, /陈默/)
})

test("T3 提示词掉锚点：算成「需要重新生成分镜」，指向分镜那一步", () => {
  const list = buildTodoList({ completed: done, shots: [shot()], expiredShots: 3 })
  const item = list.find((i) => i.id === "expired-shots")
  assert.ok(item, "掉锚点没有出现在待办里")
  assert.equal(item!.step, "shots")
  assert.match(item!.text, /3 个镜头/)
  assert.match(item!.text, /锚点/)
})

test("T4 自己标了「需返修」的镜头也算待办", () => {
  const list = buildTodoList({
    completed: done,
    shots: [shot({ shot: 1, status: "rework" }), shot({ shot: 2, status: "done" })],
    expiredShots: 0,
  })
  const item = list.find((i) => i.id === "rework-shots")
  assert.ok(item)
  assert.equal(item!.step, "shots")
  assert.match(item!.text, /1 个镜头/)
})

test("T5 顺序稳定：先说要做什么（next），再说要修什么（fix），修的问题按严重度排", () => {
  const list = buildTodoList({
    completed: { ...done, scenes: false, shots: false },
    shots: [shot({ shot: 1, missingRefFor: ["陈默"], status: "rework" })],
    expiredShots: 2,
  })
  assert.deepEqual(list.map((i) => i.id), ["next", "expired-shots", "missing-refs", "rework-shots"])
})

test("T6 全部做完且没有问题：返回空清单（面板该自己藏起来）", () => {
  const list = buildTodoList({
    completed: done,
    shots: [shot({ status: "done" }), shot({ shot: 2, status: "done" })],
    expiredShots: 0,
  })
  assert.deepEqual(list, [])
})

test("T6b 还没生成分镜时不把「缺参考图」当成待办（那时候本来就没有镜头）", () => {
  const list = buildTodoList({
    completed: { ...done, characters: true, acts: false, episodes: false, visuals: false, scenes: false, shots: false },
    shots: [],
    expiredShots: 0,
  })
  assert.deepEqual(list.map((i) => i.id), ["next"])
})
