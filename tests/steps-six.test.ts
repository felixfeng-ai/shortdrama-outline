import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { STEPS } from "../lib/types.ts"

// ── G2 步骤条必须画完整六步 ──
//
// 这也是真实发生过的断层：STEPS 只列了前三个「创作层」步骤，
// 用户走到第四步时会以为流程已经结束。资产层三个步骤必须一并进步骤条。

const pageSrc = fs.readFileSync("app/page.tsx", "utf8")
const indicatorSrc = fs.readFileSync("components/StepIndicator.tsx", "utf8")

test("G2 STEPS 覆盖六个步骤，index 连续", () => {
  assert.equal(STEPS.length, 6)
  assert.deepEqual(
    STEPS.map((s) => s.index),
    [1, 2, 3, 4, 5, 6],
  )
})

test("G2b 每一步都有 short 标签（窄屏靠它，缺了会只剩空白圆点）", () => {
  for (const step of STEPS) {
    assert.ok(step.short && step.short.length <= 4, `${step.key} 的 short 不合适：${step.short}`)
  }
})

test("G2c 层级标记：前三步 story，后三步 asset", () => {
  assert.deepEqual(
    STEPS.map((s) => s.layer),
    ["story", "story", "story", "asset", "asset", "asset"],
  )
})

test("G2d 步骤条不再只显示第一步的文案（旧写法是 hidden sm:inline）", () => {
  assert.ok(
    !indicatorSrc.includes("i === 0 ? '' : 'hidden sm:inline'"),
    "步骤条仍在使用「只留第一步」的旧写法",
  )
  assert.ok(indicatorSrc.includes("step.short"), "窄屏应该用 short 标签")
})

test("G2e currentStep 必须能算到第 6 步（否则永远停在 3）", () => {
  const i = pageSrc.indexOf("const currentStep")
  assert.notEqual(i, -1, "找不到 currentStep")
  const line = pageSrc.slice(i, pageSrc.indexOf("\n", i))
  for (const n of ["4", "5", "6"]) {
    assert.ok(line.includes(n), `currentStep 没有覆盖第 ${n} 步`)
  }
})

test("G2f 步骤条的 completed 不能硬编码 false（会让资产层的勾永远不出现）", () => {
  const i = pageSrc.indexOf("completed={{")
  assert.notEqual(i, -1, "找不到 completed")
  const block = pageSrc.slice(i, pageSrc.indexOf("}}", i))
  assert.ok(block.includes("visuals.length > 0"), "completed.visuals 应该是真实状态")
  assert.ok(block.includes("shots.length > 0"), "completed.shots 应该是真实状态")
})

test("G2g 六步的标题都从 STEPS 取，不散落硬编码", () => {
  for (const n of [3, 4, 5]) {
    assert.ok(
      pageSrc.includes(`STEPS[${n}].title`),
      `第 ${n + 1} 步的标题没有从 STEPS 取`,
    )
  }
})
