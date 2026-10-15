import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { isAbortError } from "../lib/api.ts"

// ── R1 用户主动停止 ≠ 故障 ──
//
// 点「停止」时 fetch 抛 AbortError。如果把它当成普通 Error 处理，
// 界面会弹一条红色「生成失败」，用户以为点坏了东西。

test("R1 isAbortError 能从普通错误里认出取消", () => {
  const abort = new Error("The user aborted a request.")
  abort.name = "AbortError"
  assert.equal(isAbortError(abort), true)
  assert.equal(isAbortError(new Error("This operation was aborted")), true)
  assert.equal(isAbortError(new Error("网络连接失败，请检查网络后重试")), false)
  assert.equal(isAbortError(null), false)
  assert.equal(isAbortError("aborted"), false)
})

// ── R2 刷新可续的地基：前三步也必须落库 ──
//
// 曾经只有定妆/场景/分镜会写快照，前三步（想法/人物/三幕/分集）不写，
// 于是刷新一下「写故事」那半边全没了，只剩资产层——这不成产品。
// 这条测试盯着「每一环都写」，防止以后有人只删一处。

test("R2 六个步骤的产出都要落成快照，恢复才有东西可填", () => {
  const files: [string, string][] = [
    ["app/api/characters/route.ts", "'idea'"],
    ["app/api/characters/route.ts", "'characters'"],
    ["app/api/acts/route.ts", "'acts'"],
    ["app/api/episodes/route.ts", "'episodes'"],
    ["app/api/visual/route.ts", "visualCharacters"],
    ["app/api/scenes/route.ts", "scenes"],
    ["app/api/shots/route.ts", "shots"],
  ]
  for (const [file, kind] of files) {
    const src = fs.readFileSync(file, "utf8")
    assert.ok(src.includes("persistIfProject"), `${file} 没有落快照`)
    assert.ok(src.includes(kind), `${file} 没有写 ${kind} 这一版`)
  }
})

test("R2b 页面必须有恢复逻辑，且恢复后对齐「基于哪一版生成」", () => {
  const src = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(src.includes("listProjects()"), "没有读项目列表")
  assert.ok(src.includes("已恢复上次的项目"), "恢复后要给用户一句说明")
  assert.ok(src.includes("setActsBuiltFrom(sig)"), "恢复后要对齐标记，否则一进来满屏「已过期」")
})
