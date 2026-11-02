import { test } from "node:test"
import assert from "node:assert/strict"

import {
  buildCanvasActionQueue,
  filterCanvasItems,
  paginateCanvasItems,
  summarizeCanvasTasks,
} from "../lib/canvas-view.ts"

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

test("画布范围筛选支持按集与场次下钻，并可和搜索、待补叠加", () => {
  const scoped = [
    { title: "第 1 集第 1 镜", episode: 1, scene: "天台", missing: false },
    { title: "第 2 集第 1 镜", episode: 2, scene: "仓库", missing: true },
    { title: "第 2 集第 2 镜", episode: 2, scene: "天台", missing: false },
  ]
  assert.deepEqual(
    filterCanvasItems(scoped, "", false, { episode: 2 }).map((item) => item.title),
    ["第 2 集第 1 镜", "第 2 集第 2 镜"],
  )
  assert.deepEqual(
    filterCanvasItems(scoped, "", true, { episode: 2, scene: "仓库" }).map((item) => item.title),
    ["第 2 集第 1 镜"],
  )
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

test("画布任务汇总：人物、地点、镜头的运行与失败映射到正确节点", () => {
  const summary = summarizeCanvasTasks([
    { targetType: "character", targetId: "v1", status: "running" },
    { targetType: "character", targetId: "v2", status: "queued" },
    { targetType: "character", targetId: "v3", status: "failed" },
    { targetType: "place", targetId: "p1", status: "running" },
    { targetType: "shot", targetId: "s1", status: "failed" },
    { targetType: "shot", targetId: "s2", status: "succeeded" },
  ])

  assert.deepEqual(summary.visuals, { running: 2, failed: 1 })
  assert.deepEqual(summary.places, { running: 1, failed: 0 })
  assert.deepEqual(summary.shots, { running: 0, failed: 1 })
})

test("画布优先处理：失败任务排最前，随后是具体缺项且不重复", () => {
  const nodes = [
    {
      id: "visuals",
      label: "视觉定妆",
      issue: 2,
      items: [
        { id: "v1", title: "陈默", meta: "视觉锚点待补", missing: true },
        { id: "v2", title: "林远", meta: "人物设定已更新", missing: true },
      ],
    },
    {
      id: "shots",
      label: "分镜",
      issue: 2,
      items: [
        { id: "s1", targetId: "entity-s1", title: "第 8 集第 3 镜", meta: "首帧生成失败", missing: true },
        { id: "s2", title: "第 8 集第 4 镜", note: "缺陈默参考图", missing: true },
      ],
    },
  ]
  const queue = buildCanvasActionQueue(nodes, [
    { targetType: "shot", targetId: "entity-s1", status: "failed" },
    { targetType: "character", targetId: "v2", status: "running" },
  ])

  assert.equal(queue[0].kind, "task-failed")
  assert.equal(queue[0].node, "shots")
  assert.equal(queue[0].itemId, "s1")
  assert.equal(queue[0].title, "第 8 集第 3 镜")
  assert.equal(queue.filter((item) => item.node === "shots" && item.itemId === "s1").length, 1)
  assert.ok(queue.some((item) => item.node === "visuals" && item.itemId === "v2"))
})

test("画布优先处理：没有具体缺项时保留节点级提醒", () => {
  const queue = buildCanvasActionQueue([
    {
      id: "episodes",
      label: "分集剧情",
      issue: 3,
      items: [{ id: "e1", title: "第 1 集", missing: false }],
    },
  ], [])

  assert.equal(queue.length, 1)
  assert.equal(queue[0].kind, "node-issue")
  assert.equal(queue[0].title, "分集剧情")
  assert.match(queue[0].reason, /3/)
})
