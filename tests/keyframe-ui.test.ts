import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

function read(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
}

const keyframe = read("components/KeyframePanel.tsx")
const client = read("lib/generation/client.ts")
const visual = read("components/VisualAnchorPanel.tsx")
const shot = read("components/ShotCard.tsx")
const shotList = read("components/ShotList.tsx")
const page = read("app/page.tsx")
const css = read("app/globals.css")

test("G4/G5 关键帧卡同时接到角色定妆和镜头首帧", () => {
  assert.ok(keyframe.includes("KeyframePanel"), "缺少关键帧卡组件")
  assert.ok(visual.includes("<KeyframePanel"), "角色定妆卡没有生成入口")
  assert.ok(visual.includes('actionLabel="生成定妆图"'), "角色入口文案不明确")
  assert.ok(shot.includes("<KeyframePanel"), "镜头卡没有首帧入口")
  assert.ok(shot.includes('actionLabel="生成首帧"'), "镜头入口文案不明确")
  assert.ok(shotList.includes("projectId"), "镜头列表没有透传当前项目")
})

test("G4/G5 关键帧入口必须使用中文标题并位于长字段编辑区之前", () => {
  const visualEntry = visual.indexOf("<KeyframePanel")
  const visualFields = visual.indexOf("{FIELDS.map")
  const shotEntry = shot.indexOf("<KeyframePanel")
  const shotFields = shot.indexOf("{/* 出场角色 */}")

  assert.ok(keyframe.includes("云端关键帧"), "关键帧标题仍然只有英文")
  assert.ok(visualEntry >= 0 && visualEntry < visualFields, "角色定妆入口仍在长字段之后")
  assert.ok(shotEntry >= 0 && shotEntry < shotFields, "镜头首帧入口仍在长字段之后")
})

test("G1 普通编剧不需要 Provider、模型或 API Key", () => {
  assert.ok(keyframe.includes("通义万相"), "没有说明平台默认图像服务")
  assert.equal(keyframe.includes("type=\"password\""), false, "仍然暴露了 API Key 输入")
  assert.equal(keyframe.includes("Provider"), false, "仍然暴露 Provider 选择")
  assert.equal(keyframe.includes("API Key"), false, "仍然暴露 API Key 概念")
  assert.equal(keyframe.includes("sessionStorage"), false, "前端不应保存模型密钥")
})

test("G6 隐私边界在关键帧卡上可见", () => {
  assert.ok(keyframe.includes("本地参考图不会上传"), "没有说明本地参考图不上传")
  assert.ok(keyframe.includes("云端生成"), "没有标出云端生成边界")
  assert.ok(client.includes("/api/generations"), "没有走统一生成接口")
})

test("G3 历史资产可预览、回选并有运行中禁用态", () => {
  assert.ok(keyframe.includes("selectedAt"), "没有采用状态")
  assert.ok(keyframe.includes("history"), "没有历史版本入口")
  assert.ok(keyframe.includes("generating"), "没有本地运行状态")
  assert.ok(keyframe.includes("disabled={generating"), "运行中没有禁用重复提交")
  assert.ok(keyframe.includes("/api/generated-assets/"), "没有关键帧预览地址")
})

test("G6.3 关键帧状态使用主题令牌、Responsive 与 reduced-motion", () => {
  assert.ok(css.includes(".keyframe-"), "缺少关键帧主题样式")
  assert.ok(css.includes("@media (max-width: 720px)"), "缺少窄屏规则")
  assert.ok(css.includes("prefers-reduced-motion"), "缺少减少动效兜底")
  assert.ok(page.includes("ensureProject"), "页面没有把懒建项目能力传给关键帧入口")
})
