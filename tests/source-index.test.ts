import { test } from "node:test"
import assert from "node:assert/strict"

import {
  buildSourceIndex,
  listSourceMaterials,
  readSourceChunk,
} from "../lib/skills/source-index.ts"

const script = `第一章 雨夜
陈默站在旧楼门口。

第二章 门缝
苏婉没有开门，门缝里掉出一张车票。

第三章 旧信
陈默拆开那封迟到四十年的信。`

test("SRC1 原文按章节建立可定位索引", () => {
  const index = buildSourceIndex({
    id: "material-1",
    name: "旧信剧本.txt",
    kind: "script",
    characterCount: 80,
    content: script,
  }, 30)

  assert.equal(index.materialId, "material-1")
  assert.equal(index.chunks[0].title, "第一章 雨夜")
  assert.ok(index.chunks.some((chunk) => chunk.title === "第二章 门缝"))
  assert.ok(index.chunks.length >= 3)
  assert.equal(
    index.chunks.map((chunk) => chunk.content).join("").replace(/\s/g, ""),
    script.replace(/\s/g, ""),
  )
})

test("SRC2 Agent 可先看原文目录，再按需读取具体章节", () => {
  const materials = [{
    id: "material-1",
    name: "旧信剧本.txt",
    kind: "script",
    characterCount: Array.from(script).length,
    content: script,
  }]
  const catalog = listSourceMaterials(materials)
  assert.match(catalog, /旧信剧本/)
  assert.match(catalog, /章/)

  const chunk = readSourceChunk(materials, "material-1", 1)
  assert.equal(chunk.ok, true)
  assert.match(chunk.title, /第二章/)
  assert.match(chunk.content, /苏婉没有开门/)
  assert.ok(chunk.content.length <= 6_200)
})

test("SRC3 不存在的原文或章节不会编造内容", () => {
  const missing = readSourceChunk([], "missing", 0)
  assert.equal(missing.ok, false)
  assert.match(missing.content, /没有|不存在/)
  const badIndex = readSourceChunk([{
    id: "material-1",
    name: "旧信剧本.txt",
    kind: "script",
    characterCount: 80,
    content: script,
  }], "material-1", 999)
  assert.equal(badIndex.ok, false)
})
