import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  buildImageStyleDirective,
  withImageStyle,
} from "../lib/generation/prompt.ts"
import {
  buildAliyunImageRequest,
  projectImageSeed,
} from "../lib/generation/model.ts"

const LOOK = {
  palette: "冷蓝、低饱和",
  light: "单一顶光、硬阴影",
  lens: "长焦压缩",
  banned: "霓虹、赛博感",
}

test("V1.1 视觉宪法进入统一图像风格指令", () => {
  const directive = buildImageStyleDirective(LOOK)
  assert.match(directive, /冷蓝、低饱和/)
  assert.match(directive, /单一顶光、硬阴影/)
  assert.match(directive, /长焦压缩/)
  assert.match(directive, /霓虹、赛博感/)
})

test("V1.2 空视觉宪法不改变原提示词", () => {
  assert.equal(buildImageStyleDirective({ palette: "", light: "", lens: "", banned: "" }), "")
  assert.equal(
    withImageStyle("cinematic portrait", { palette: "", light: "", lens: "", banned: "" }),
    "cinematic portrait",
  )
})

test("V1.1 已有视觉宪法块时不重复插入", () => {
  const base = "cold portrait\n\n## 视觉宪法（逐镜遵守）\n- 色调：冷蓝"
  assert.equal(withImageStyle(base, LOOK), base)
})

test("V2 同一项目 seed 稳定且落在合法范围", () => {
  const a = projectImageSeed("project-a")
  const b = projectImageSeed("project-a")
  const c = projectImageSeed("project-b")
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.ok(a >= 0 && a <= 2147483647)
  assert.ok(c >= 0 && c <= 2147483647)
})

test("V2.2 通义请求携带项目 seed", () => {
  const seed = projectImageSeed("project-seed")
  const request = buildAliyunImageRequest({
    prompt: "portrait",
    model: "wanx2.1-t2i-turbo",
    aspect: "portrait",
    seed,
  })
  assert.equal((request.body.parameters as Record<string, unknown>).seed, seed)
})

test("V3 关键帧卡展示视觉宪法状态，页面透传 LookBook", () => {
  const panel = fs.readFileSync("components/KeyframePanel.tsx", "utf8")
  const visual = fs.readFileSync("components/VisualAnchorPanel.tsx", "utf8")
  const shot = fs.readFileSync("components/ShotCard.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")

  assert.ok(panel.includes("视觉宪法已带入"), "缺少已带入状态")
  assert.ok(panel.includes("视觉宪法未填写"), "缺少未填写风险提示")
  assert.ok(visual.includes("look={look}"), "角色卡没有透传 LookBook")
  assert.ok(shot.includes("look={look}"), "镜头卡没有透传 LookBook")
  assert.ok(page.includes("<VisualAnchorPanel"), "页面没有挂载角色卡")
})
