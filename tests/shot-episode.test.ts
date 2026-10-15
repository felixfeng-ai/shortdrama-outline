import { test } from "node:test"
import assert from "node:assert/strict"

import { normalizeShots } from "../lib/assets/normalize.ts"
import { shotToWorkOrder, shotsToCsv, buildStoryboardHtml } from "../lib/assets/export.ts"
import type { Shot, VisualCharacter } from "../lib/assets/types.ts"

// ── E10-E11 集号要能一路走到出口 ──
//
// 分镜本来就是**全剧**的：场次覆盖 10 集，镜头按剧情顺序铺满全部场次。
// 但集号在分镜这一步被丢掉了——模型收到的场次列表写着「第 N 集」，
// 要求的输出模板里却没有集号字段，于是 Shot 上没有集号，
// prompts.csv / 执行单 / 离线分镜表也全都没有。
//
// 后果不是少了个字段：一部剧 80 张卡片平铺着，用户分不清哪几镜属于哪一集，
// 量少的时候（17 镜 ≈ 一集）会直接得出「这是一集的分镜吧」的结论。

const visuals: VisualCharacter[] = []

function rawShot(over: Record<string, unknown> = {}) {
  return {
    scene: "咖啡馆内·黄昏",
    characters: ["林远"],
    action: "推门",
    shotSize: "中景",
    camera: "固定",
    prompt: "a man in a sand jacket",
    ...over,
  }
}

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "s1", entityId: "e1", shot: 1, episode: 3, scene: "咖啡馆内·黄昏",
    characters: ["林远"], action: "推门", speaker: "", dialogue: "", place: "",
    shotSize: "中景", camera: "固定",
    prompt: "a man in a sand jacket", refImages: ["林远·正面"], missingRefFor: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo", ...over,
  }
}

test("E10 分镜带上集号（模型回了就照收）", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot({ episode: 7 })] },
    visuals, stamp: 1,
  })
  assert.equal(shots[0].episode, 7)
})

test("E10b 集号缺失或非法时标成未知（0），不能静默变成第 1 集", () => {
  const shots = normalizeShots({
    raw: { shots: [rawShot(), rawShot({ episode: "第三集" }), rawShot({ episode: -2 })] },
    visuals, stamp: 1,
  })
  for (const s of shots) assert.equal(s.episode, 0, "非法集号被悄悄当成了有效集号")
})

test("E11 执行单写清这一镜属于第几集", () => {
  const w = shotToWorkOrder(shot({ episode: 5 }))
  assert.ok(w.includes("第 5 集"), "执行单没写集号")
})

test("E11b 集号未知时执行单显式标注，不假装是第 1 集", () => {
  const w = shotToWorkOrder(shot({ episode: 0 }))
  assert.ok(!w.includes("第 0 集"), "把未知集号渲染成了第 0 集")
  assert.ok(w.includes("集号"), "未知集号没有任何提示")
})

test("E11c prompts.csv 有集号列", () => {
  const csv = shotsToCsv([shot({ episode: 5 })])
  const head = csv.split("\n")[0]
  assert.ok(head.includes("集"), "CSV 表头缺集号列")
  assert.ok(csv.includes("5"), "CSV 行里没有集号")
})

test("E11d 离线分镜表有集号列", () => {
  const html = buildStoryboardHtml({ title: "测试剧", visuals: [], scenes: [], shots: [shot({ episode: 5 })] })
  assert.ok(html.includes("集号") || html.includes("集</th>"), "离线分镜表缺集号列")
})
