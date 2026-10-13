import { test } from "node:test"
import assert from "node:assert/strict"

import { matchByFolder } from "../lib/assets/vault.ts"

// ── F6 按目录名自动预挂 ──
//
// 「目录名 == 角色名」看起来是一行 includes，但边界很多：
// 角色名互相包含（林远 / 林远之）、目录名带后缀（林远-定妆）、
// 平铺文件（没有目录）、大小写。这些都得写死，否则会自动挂错图 ——
// 挂错比不挂更糟，因为用户会以为已经垫好图了。

const f = (key: string) => ({ key, name: key.split("/").pop() ?? key, hash: "h", size: 1, mime: "image/png" })

test("F6 目录名等于角色名时命中", () => {
  const hit = matchByFolder([f("林远/正面.png"), f("苏婉/正面.png")], ["林远"])
  assert.equal(hit["林远"]?.length, 1)
  assert.equal(hit["林远"]?.[0], "林远/正面.png")
  assert.equal(hit["苏婉"], undefined)
})

test("F6b 同一角色的多张图全部命中", () => {
  const hit = matchByFolder([f("林远/正面.png"), f("林远/侧面.png")], ["林远"])
  assert.deepEqual(hit["林远"], ["林远/正面.png", "林远/侧面.png"])
})

test("F6c 目录名带后缀（林远-定妆）也能命中", () => {
  const hit = matchByFolder([f("林远-定妆/正面.png")], ["林远"])
  assert.equal(hit["林远"]?.[0], "林远-定妆/正面.png")
})

test("F6d 平铺在根目录的文件（无目录）不自动挂——宁可让用户手动挂", () => {
  const hit = matchByFolder([f("正面.png"), f("林远.png")], ["林远"])
  assert.equal(hit["林远"], undefined)
})

test("F6e 嵌套子目录按第一段目录名判定", () => {
  const hit = matchByFolder([f("林远/定妆/正面.png")], ["林远"])
  assert.equal(hit["林远"]?.[0], "林远/定妆/正面.png")
})

test("F6f 只返回命中项，没命中的角色不出现在结果里（避免覆盖用户手挂的）", () => {
  const hit = matchByFolder([f("苏婉/正面.png")], ["林远", "苏婉"])
  assert.equal(hit["林远"], undefined)
  assert.equal(hit["苏婉"]?.length, 1)
})
