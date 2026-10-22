import { test } from "node:test"
import assert from "node:assert/strict"

import { filterCanvasItems, paginateCanvasItems } from "../lib/canvas-view.ts"

const items = [
  { title: "第 1 集", meta: "钩子 12 字", note: "快递员回到旧宅", missing: false },
  { title: "第 2 集", meta: "缺钩子", note: "第一次反转", missing: true },
  { title: "第 3 集", meta: "钩子 32 字", note: "旧宅真相揭开", missing: true },
]

test("画布搜索同时匹配标题、元信息与正文", () => {
  assert.deepEqual(filterCanvasItems(items, "旧宅", false).map((item) => item.title), ["第 1 集", "第 3 集"])
  assert.deepEqual(filterCanvasItems(items, "缺钩子", false).map((item) => item.title), ["第 2 集"])
  assert.deepEqual(filterCanvasItems(items, "第 3", false).map((item) => item.title), ["第 3 集"])
})

test("画布待补筛选可以和搜索叠加，不匹配时返回空", () => {
  assert.deepEqual(filterCanvasItems(items, "", true).map((item) => item.title), ["第 2 集", "第 3 集"])
  assert.deepEqual(filterCanvasItems(items, "旧宅", true).map((item) => item.title), ["第 3 集"])
  assert.deepEqual(filterCanvasItems(items, "不存在", true), [])
})

test("画布分页夹紧越界页码，并保留正确页数", () => {
  const many = Array.from({ length: 23 }, (_, index) => ({ title: `第 ${index + 1} 集`, missing: false }))
  const first = paginateCanvasItems(many, 0, 8)
  const last = paginateCanvasItems(many, 99, 8)

  assert.equal(first.pageCount, 3)
  assert.equal(first.items.length, 8)
  assert.equal(first.items[0].title, "第 1 集")
  assert.equal(last.page, 2)
  assert.equal(last.items.length, 7)
  assert.equal(last.items[0].title, "第 17 集")
})
