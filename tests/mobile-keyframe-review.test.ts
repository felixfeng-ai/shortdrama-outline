import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { buildReviewGroups } from "../lib/generation/review.ts"

const visuals = [
  { id: "visual-1", entityId: "character-1", name: "苏婉" },
] as never

const shots = [
  { id: "shot-1", entityId: "shot-entity-1", shot: 3, scene: "旧仓库" },
] as never

function asset(overrides: Record<string, unknown>) {
  return {
    id: "asset-1",
    taskId: "task-1",
    projectId: "project-1",
    targetType: "character",
    targetId: "character-1",
    storageKey: "one.png",
    mime: "image/png",
    bytes: 1024,
    providerId: "aliyun",
    model: "wanx",
    prompt: "prompt",
    selectedAt: null,
    createdAt: 1,
    downloadUrl: "/api/generated-assets/asset-1",
    ...overrides,
  } as never
}

test("K1 同角色版本归为一组，最新在前并显示角色名", () => {
  const groups = buildReviewGroups([
    asset({ id: "old", createdAt: 10 }),
    asset({ id: "new", createdAt: 30, selectedAt: 31 }),
  ], visuals, shots)

  assert.equal(groups.length, 1)
  assert.equal(groups[0].title, "苏婉")
  assert.equal(groups[0].subtitle, "角色定妆")
  assert.deepEqual(groups[0].assets.map((item) => item.id), ["new", "old"])
})

test("K2 同镜头版本归为一组，并显示镜号和场景", () => {
  const groups = buildReviewGroups([
    asset({
      id: "shot-a",
      targetType: "shot",
      targetId: "shot-entity-1",
      createdAt: 20,
    }),
    asset({
      id: "shot-b",
      targetType: "shot",
      targetId: "shot-entity-1",
      createdAt: 10,
    }),
  ], visuals, shots)

  assert.equal(groups.length, 1)
  assert.equal(groups[0].title, "第 3 镜")
  assert.equal(groups[0].subtitle, "旧仓库")
  assert.deepEqual(groups[0].assets.map((item) => item.id), ["shot-a", "shot-b"])
})

test("K3 找不到角色或镜头时使用可读兜底，不丢弃资产", () => {
  const groups = buildReviewGroups([
    asset({ id: "missing-character", targetId: "gone" }),
    asset({
      id: "missing-shot",
      targetType: "shot",
      targetId: "gone-shot",
    }),
  ], visuals, shots)

  assert.equal(groups.length, 2)
  assert.match(groups[0].title, /角色|镜头/)
  assert.ok(groups.every((group) => group.assets.length === 1))
})

test("K4 App 任务页接入真实审片区", () => {
  const shell = fs.readFileSync("components/MobileAppShell.tsx", "utf8")
  const panel = fs.readFileSync("components/MobileReviewPanel.tsx", "utf8")
  const client = fs.readFileSync("lib/generation/client.ts", "utf8")

  assert.ok(shell.includes("<MobileReviewPanel"), "任务页没有挂载审片区")
  assert.ok(panel.includes("待审关键帧"), "缺少审片区标题")
  assert.ok(panel.includes("fetchProjectGenerationAssets"), "没有读取既有生成资产")
  assert.ok(panel.includes("selectKeyframe"), "没有复用既有采用接口")
  assert.ok(panel.includes("keyframeExportName"), "下载文件名没有复用既有规则")
  assert.ok(panel.includes("chengju:generation-updated"), "生成更新后不会刷新")
  assert.ok(client.includes("/api/generations"), "生成接口不应另起一套")
  assert.equal(panel.includes("/api/generations:"), false, "审片组件不应自己拼接口")
})

test("K5 审片层可访问、可滑动、避让安全区", () => {
  const panel = fs.readFileSync("components/MobileReviewPanel.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.ok(panel.includes('role="dialog"'), "审片层没有 dialog 语义")
  assert.ok(panel.includes('aria-modal="true"'), "审片层没有模态语义")
  assert.ok(panel.includes("Escape"), "审片层不支持 Escape")
  assert.ok(panel.includes("采用此版"), "缺少采用动作")
  assert.ok(panel.includes("当前采用"), "缺少已采用状态")
  assert.ok(panel.includes("scroll-snap"), "版本没有横向滚动吸附")
  assert.ok(panel.includes("min-h-11"), "触控目标小于 44px")
  assert.ok(css.includes(".mobile-review-overlay"), "缺少全屏审片层样式")
  assert.ok(css.includes("env(safe-area-inset-top)"), "审片层没有避让顶部安全区")
  assert.ok(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*mobile-review/.test(css),
    "审片层缺少 reduced-motion 兜底",
  )
})

test("K6 采用状态可播报，关闭后焦点回到入口卡片", () => {
  const panel = fs.readFileSync("components/MobileReviewPanel.tsx", "utf8")

  assert.ok(panel.includes('aria-live="polite"'), "采用状态变化不会向读屏播报")
  assert.ok(panel.includes("returnFocusRef"), "关闭审片后没有恢复入口焦点")
  assert.ok(panel.includes("requestAnimationFrame"), "焦点恢复没有等 portal 卸载")
})
