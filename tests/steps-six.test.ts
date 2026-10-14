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
const sideNavSrc = fs.readFileSync("components/SideNav.tsx", "utf8")

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
  // 完成态收敛成一份 stepCompleted，左栏导航与窄屏步骤条共用
  const i = pageSrc.indexOf("const stepCompleted")
  assert.notEqual(i, -1, "找不到 stepCompleted")
  const block = pageSrc.slice(i, pageSrc.indexOf("}", pageSrc.indexOf("shots:", i)))
  assert.ok(block.includes("visuals.length > 0"), "completed.visuals 应该是真实状态")
  assert.ok(block.includes("shots.length > 0"), "completed.shots 应该是真实状态")
  assert.ok(pageSrc.includes("completed={stepCompleted}"), "窄屏步骤条应该复用同一份完成态")
})

test("G2g 六步的标题都从 STEPS 取，不散落硬编码", () => {
  for (const n of [3, 4, 5]) {
    assert.ok(
      pageSrc.includes(`STEPS[${n}].title`),
      `第 ${n + 1} 步的标题没有从 STEPS 取`,
    )
  }
})

// ── G3 左侧六步导航（对齐概念参考图的左栏）──
//
// 参考图的左栏是「图标 + 名称」的六个条目，不是长标题、也不是分段标题 + 说明。
// 这一条防止有人再把它写回「生成核心人物」这类带动作词的长标题。

test("G3 STEPS 必须有 nav 短标签，四个字以内", () => {
  for (const step of STEPS) {
    assert.ok(step.nav, `${step.key} 缺 nav 标签`)
    assert.ok(step.nav.length <= 4, `${step.key} 的 nav 太长：${step.nav}`)
  }
})

test("G3b 左栏导航必须用 nav 短标签，不能用 title 长标题", () => {
  assert.ok(sideNavSrc.includes("{step.nav}"), "左栏应该渲染 step.nav")
  assert.ok(!sideNavSrc.includes("{step.title}"), "左栏不该再渲染 step.title")
  assert.ok(!sideNavSrc.includes("{step.subtitle}"), "参考图左栏没有说明行")
})

test("G3c 桌面端左栏导航必须真的挂在页面上", () => {
  assert.ok(pageSrc.includes("<SideNav"), "page.tsx 没有渲染 SideNav，左栏等于没接")
  assert.ok(pageSrc.includes("from '@/components/SideNav'"), "SideNav 没有引入")
})

// ── G4 左栏高亮与「下一步」提示 ──
//
// 两个真实发生过的问题：
//   1. 高亮写成「未完成 + 当前步」，于是某一步一生成完，左栏就没有任何一项是选中的；
//   2. 一次只显示一步之后，生成完没有任何去处提示，用户不知道下一步该点哪儿。

test("G4 左栏高亮只看「正在看哪一步」，不能和完成态挂钩", () => {
  assert.ok(sideNavSrc.includes("const isCurrent = step.index === current"), "高亮条件应当是 index === current")
  assert.ok(!sideNavSrc.includes("!isDone && step.index === current"), "高亮不能再依赖 isDone")
})

test("G4b 生成完必须有下一步提示，且角色生成完要指到定妆", () => {
  assert.ok(pageSrc.includes("NEXT_STEP"), "缺少主线下一站的映射")
  assert.ok(pageSrc.includes("SIDE_STEP"), "缺少顺手解锁的资产步骤映射")
  assert.ok(/characters:\s*{\s*key:\s*'visuals'/.test(pageSrc), "角色生成完应当提示去定妆")
  assert.ok(pageSrc.includes("下一步："), "提示文案里要有「下一步」")
})
