import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

// ── G1 状态槽隔离（防回归）──
//
// 这是个真实发生过的 bug：StepKey 原先只有 3 个值，后三步（定妆/场次/分镜）
// 只能借用前三个的状态槽，于是「点视觉定妆 → 第一步的按钮变成加载中」。
//
// 根因在类型层面是可检查的，所以这里直接对源码做静态断言：
// 后三步必须用各自的槽位，不能出现在前三个槽上。

const pageSrc = fs.readFileSync("app/page.tsx", "utf8")
const typesSrc = fs.readFileSync("lib/types.ts", "utf8")

test("G1 StepKey 必须覆盖六个步骤（后三步不能借用前三个的槽）", () => {
  for (const key of ["visuals", "scenes", "shots"]) {
    assert.ok(typesSrc.includes(`'${key}'`), `StepKey 缺少 ${key}`)
  }
})

test("G1b 三个运行状态表都必须有六项（缺一项就会串台）", () => {
  const idleStatus = pageSrc.slice(pageSrc.indexOf("const IDLE_STATUS"), pageSrc.indexOf("const IDLE_ERRORS"))
  const idleErrors = pageSrc.slice(pageSrc.indexOf("const IDLE_ERRORS"), pageSrc.indexOf("const IDLE_ERRORS") + 400)

  for (const key of ["characters", "acts", "episodes", "visuals", "scenes", "shots"]) {
    assert.ok(idleStatus.includes(`${key}:`), `IDLE_STATUS 缺少 ${key}`)
    assert.ok(idleErrors.includes(`${key}:`), `IDLE_ERRORS 缺少 ${key}`)
  }
})

test("G1c 视觉定妆写入 visuals 槽，不再写 characters 槽", () => {
  const block = pageSrc.slice(
    pageSrc.indexOf("const generateVisualAnchors"),
    pageSrc.indexOf("const generateVisualAnchors") + 300,
  )
  assert.ok(block.includes('"visuals"'), "视觉定妆应该用 visuals 槽")
  assert.ok(!block.includes('"characters"'), "视觉定妆不应再用 characters 槽")
})

test("G1d 第 4 步的 status 不能是硬编码的 done（否则点了没有任何反馈）", () => {
  const i = pageSrc.indexOf("index={4}")
  assert.notEqual(i, -1, "找不到第 4 步")
  const block = pageSrc.slice(i, i + 400)
  assert.ok(!block.includes('status="done"'), "第 4 步的 status 不该硬编码为 done")
  assert.ok(block.includes("status={status.visuals}"), "第 4 步应接上 visuals 槽")
})
