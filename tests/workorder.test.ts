import { test } from "node:test"
import assert from "node:assert/strict"

import { shotToWorkOrder, shotsToWorkList } from "../lib/assets/export.ts"
import type { Shot } from "../lib/assets/types.ts"

// ── E4-E6 执行单 ──
//
// 即梦/可灵都没有「导入项目包」的入口，操作模型只有「填提示词 + 传参考图 → 生成」。
// 所以工具能做的极限不是省掉操作，而是让用户去平台时不用回头找信息 ——
// 从「找信息」变成「照单执行」。这几条测试就是把「照单执行」的可执行性钉住。

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "s1", entityId: "e1", shot: 7, scene: "咖啡馆内·黄昏",
    characters: ["林远", "苏婉"], action: "推门", camera: "中景",
    prompt: "a man in a sand jacket, cinematic",
    refImages: ["林远·正面", "苏婉·正面"], missingRefFor: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo", ...over,
  }
}

test("E4 执行单含镜号、提示词、参考图、参数四样", () => {
  const w = shotToWorkOrder(shot())
  assert.ok(w.includes("第 7 镜"), "缺镜号")
  assert.ok(w.includes("咖啡馆内·黄昏"), "缺场景")
  assert.ok(w.includes("a man in a sand jacket"), "缺提示词")
  assert.ok(w.includes("林远·正面") && w.includes("苏婉·正面"), "缺参考图")
  assert.ok(w.includes("9:16") && w.includes("5s"), "缺参数")
})

test("E4b 提示词必须完整出现在执行单里（不能被截断）", () => {
  const long = "x".repeat(500)
  const w = shotToWorkOrder(shot({ prompt: long }))
  assert.ok(w.includes(long), "长提示词被截断了")
})

test("E4c 缺参考图时必须显式标出，不能静默省略", () => {
  const w = shotToWorkOrder(shot({ refImages: [], missingRefFor: ["陈默"] }))
  assert.ok(w.includes("缺"), "缺图没有提示")
  assert.ok(w.includes("陈默"), "没写清是谁缺图")
})

test("E5 全片清单含镜头总数与使用说明", () => {
  const list = shotsToWorkList([shot(), shot({ id: "s2", shot: 8 })])
  assert.ok(list.includes("共 2 个镜头"), "缺总数")
  assert.ok(list.includes("用法"), "缺使用说明")
})

test("E5b 全片清单里每个镜头的提示词都在（一个都不能漏）", () => {
  const shots = Array.from({ length: 5 }, (_, i) =>
    shot({ id: `s${i}`, shot: i + 1, prompt: `prompt-number-${i + 1}` }),
  )
  const list = shotsToWorkList(shots)
  for (let i = 1; i <= 5; i++) {
    assert.ok(list.includes(`prompt-number-${i}`), `第 ${i} 镜的提示词丢了`)
  }
})

test("E5c 空镜头列表不崩，返回带说明的空清单", () => {
  const list = shotsToWorkList([])
  assert.ok(list.includes("共 0 个镜头"))
})
