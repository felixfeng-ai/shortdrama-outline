// 影响面的口径：改一处之后「有几个镜头要重做」必须算对。
//
// 这条口径曾经写在 page.tsx 里、没有测试，于是注释说 A、代码做 B，
// 界面上那句「N 个镜头的提示词已过期」长期是错的。这一组测试盯的就是它。
import { test } from "node:test"
import assert from "node:assert/strict"

import { auditShots, type ProjectSnapshot } from "../lib/assets/impact.ts"
import { openDb, getDataDir } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { persistIfProject } from "../lib/assets/persist.ts"
import { findImpact } from "../lib/assets/graph.ts"
import type { VisualCharacter } from "../lib/assets/types.ts"

const OLD_ANCHOR = "wearing: 沙色短夹克"
const NEW_ANCHOR = "wearing: 靛蓝呢大衣"

const vc = (over: Partial<VisualCharacter> = {}): VisualCharacter => ({
  id: "vc-1", name: "张三", age: "28岁", face: "偏长脸、窄眼", hair: "黑色短发、齐耳",
  marks: "左眉尾浅疤", wardrobe: "沙色短夹克", props: "", anchor: OLD_ANCHOR, ...over,
})

const shot = (over: { prompt?: string; characters?: string[]; status?: string } = {}) => ({
  id: "s1", entityId: "e1", shot: 1, scene: "咖啡馆内·黄昏",
  characters: ["张三"], action: "推门", shotSize: "中景", camera: "固定",
  prompt: `A man in a cafe, ${OLD_ANCHOR}`, refImages: [], missingRefFor: [],
  params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo",
  ...over,
})

const snap = (over: Partial<ProjectSnapshot> = {}): ProjectSnapshot => ({
  id: "vc-2", kind: "visualCharacters", version: 2, parents: ["c-1"], payload: [vc()], ...over,
})

function tmpDbPath(tag: string): string {
  return `${getDataDir()}/tmp/t-${tag}-${process.pid}-${Date.now()}.db`
}

// ── I1：口径是「锚点对不上」，不是「没做完」─────────────────────

test("I1 分镜基于旧定妆时，缺锚点的镜头被数出来", () => {
  const audit = auditShots(
    [snap({ payload: [vc({ anchor: NEW_ANCHOR })] })],
    [snap({ id: "shots-1", kind: "shots", version: 1, parents: ["vc-1"], payload: [
      shot(),                                      // 提示词里是旧锚点
      shot({ prompt: "man in beige jacket" }),      // 被模型改写过的
    ] })],
  )
  assert.equal(audit.expired, 2)
  assert.equal(audit.total, 2)
  assert.equal(audit.outOfSync, true)
})

test("I1b 全部标记完成也照数，不是 0", () => {
  // 旧口径数的是 status !== "done"：项目全部拍完时它会返回 0，
  // 界面于是告诉用户「改了定妆但没有任何镜头受影响」——恰恰是最需要重做的时候。
  const audit = auditShots(
    [snap({ payload: [vc({ anchor: NEW_ANCHOR })] })],
    [snap({ id: "shots-1", kind: "shots", version: 1, parents: ["vc-1"], payload: [
      shot({ status: "done" }), shot({ status: "done" }), shot({ status: "done" }),
    ] })],
  )
  assert.equal(audit.expired, 3)
})

test("I1c 没有出场角色 / 角色没有锚点 → 不算过期，不误报", () => {
  const audit = auditShots(
    [snap({ payload: [vc({ anchor: NEW_ANCHOR })] })],
    [snap({ id: "shots-1", kind: "shots", version: 1, parents: ["vc-1"], payload: [
      shot({ prompt: "empty street", characters: [] }),
      shot({ prompt: "portrait", characters: ["李四"] }),
    ] })],
  )
  assert.equal(audit.expired, 0)
})

// ── I2：两边对齐时必须安静下来 ──────────────────────────────────

test("I2 分镜基于当前定妆生成 → expired 为 0（不比对、不误报）", () => {
  const latestVc = snap({ id: "vc-2" })
  const audit = auditShots(
    [latestVc],
    [snap({ id: "shots-2", kind: "shots", version: 2, parents: ["vc-2"], payload: [
      shot({ prompt: `fresh, ${NEW_ANCHOR}` }),
    ] })],
  )
  assert.equal(audit.outOfSync, false)
  assert.equal(audit.expired, 0)
  assert.equal(audit.total, 1)
})

test("I2b 还没有分镜 / payload 不是数组时不崩", () => {
  assert.deepEqual(auditShots([snap()], []), {
    total: 0, expired: 0, outOfSync: false, lockedTraitShots: 0, lockedTraitIssues: [],
  })
  assert.equal(
    auditShots([snap()], [snap({ id: "shots-1", kind: "shots", parents: [], payload: { oops: 1 } })]).total,
    0,
  )
})

test("I4 分镜即使与当前定妆对齐，也要逐项检查禁改项", () => {
  const anchor = "age: 28岁, face: 偏长脸、窄眼, hair: 黑色短发、齐耳, distinguishing feature: 左眉尾浅疤"
  const audit = auditShots(
    [snap({ payload: [vc({ anchor })] })],
    [snap({
      id: "shots-current",
      kind: "shots",
      version: 2,
      parents: ["vc-2"],
      payload: [shot({ prompt: "portrait, age: 28岁, face: 偏长脸、窄眼" })],
    })],
  )

  assert.equal(audit.outOfSync, false)
  assert.equal(audit.lockedTraitShots, 1)
  assert.deepEqual(audit.lockedTraitIssues, [
    { shot: 1, character: "张三", traits: ["hair", "marks"] },
  ])
})

// ── I3：整条链走一遍 ────────────────────────────────────────────

test("I3 重新生成定妆之后：新定妆查不到下游，但对账仍然算得出缺锚点的镜头", () => {
  // 这条测试锁的是一个方向问题——从新定妆出发查下游是查不到旧分镜的
  // （旧分镜的父快照是旧定妆），所以影响面必须反过来从分镜这一侧对账。
  const db = openDb(tmpDbPath("i3"))
  const p = createProject(db, "测试剧")

  persistIfProject(db, p.id, "characters", [{ name: "张三" }], { kinds: [] })
  const vc1 = persistIfProject(db, p.id, "visualCharacters", [vc()], { kinds: ["characters"] })!
  const shots1 = persistIfProject(db, p.id, "shots", [
    shot({ prompt: `a, ${OLD_ANCHOR}` }),
    shot({ prompt: `b, ${OLD_ANCHOR}` }),
  ], { kinds: ["scenes", "visualCharacters"] })!

  // 用户改了定妆，重新生成 → vc2
  const vc2 = persistIfProject(db, p.id, "visualCharacters", [vc({ anchor: NEW_ANCHOR })], {
    kinds: ["characters"],
  })!

  // 从新定妆查下游：查不到那批旧分镜
  assert.deepEqual(findImpact(db, vc2.id), [])

  // 但对账对得上：两镜的提示词都是旧锚点
  const audit = auditShots([toSnap(vc2), toSnap(vc1)], [toSnap(shots1)])
  assert.equal(audit.outOfSync, true)
  assert.equal(audit.total, 2)
  assert.equal(audit.expired, 2)
})

/** 把 snapshot 适配成对账输入（列表接口返回的就是这些字段） */
function toSnap(s: { id: string; kind: string; version: number; parents: string[]; payload: unknown }): ProjectSnapshot {
  return { id: s.id, kind: s.kind, version: s.version, parents: s.parents, payload: s.payload }
}

test("I3b 重新生成分镜之后，对账回到安静状态", () => {
  const db = openDb(tmpDbPath("i3b"))
  const p = createProject(db, "测试剧")

  persistIfProject(db, p.id, "characters", [{ name: "张三" }], { kinds: [] })
  const vc1 = persistIfProject(db, p.id, "visualCharacters", [vc()], { kinds: ["characters"] })!
  persistIfProject(db, p.id, "shots", [shot({ prompt: `old, ${OLD_ANCHOR}` })], {
    kinds: ["scenes", "visualCharacters"],
  })
  const vc2 = persistIfProject(db, p.id, "visualCharacters", [vc({ anchor: NEW_ANCHOR })], {
    kinds: ["characters"],
  })!
  const shots2 = persistIfProject(db, p.id, "shots", [shot({ prompt: `new, ${NEW_ANCHOR}` })], {
    kinds: ["scenes", "visualCharacters"],
  })!

  const audit = auditShots([toSnap(vc2), toSnap(vc1)], [toSnap(shots2)])
  assert.equal(audit.outOfSync, false)
  assert.equal(audit.expired, 0)
})
