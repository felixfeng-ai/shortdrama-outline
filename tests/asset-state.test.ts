import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const visualSrc = fs.readFileSync("components/VisualAnchorPanel.tsx", "utf8")
const attachSrc = fs.readFileSync("components/AttachReview.tsx", "utf8")
const versionBarSrc = fs.readFileSync("components/VersionBar.tsx", "utf8")

test("AS1 定妆步骤标记使用朱砂，不并进暖赭完成态", () => {
  assert.ok(visualSrc.includes("rounded-chip bg-accent-700"), "定妆步骤编号仍不是朱砂")
  assert.ok(!visualSrc.includes("rounded-chip bg-done-500"), "定妆步骤编号仍是暖赭")
})

test("AS2 图库已对上数量使用朱砂，和隐私状态区分", () => {
  assert.ok(attachSrc.includes('<b className="text-accent-700">{hung}</b>'), "已对上数量仍不够醒目")
  assert.ok(attachSrc.includes("bg-done-100"), "隐私状态锚点不应被一起改掉")
})

test("AS3 AI 兜底属于可执行警告，使用朱砂而不是暖赭", () => {
  assert.ok(
    attachSrc.includes("rounded-card border border-accent-200 bg-accent-50/60"),
    "AI 兜底面板仍是暖赭",
  )
  assert.ok(attachSrc.includes("rounded-chip bg-accent-600"), "AI 兜底按钮仍不是朱砂")
})

test("AS4 禁改项在定妆卡与版本提示里都说人话", () => {
  assert.ok(visualSrc.includes("禁改项"), "定妆卡没有标出禁改项")
  assert.ok(visualSrc.includes("服装、道具可随场景调整"), "允许变化范围没有说清")
  assert.ok(versionBarSrc.includes("个镜头缺少禁改项"), "版本提示没有报出禁改项缺口")
  assert.ok(versionBarSrc.includes("visualTraitLabel"), "版本提示没有把字段名翻译成人话")
})
