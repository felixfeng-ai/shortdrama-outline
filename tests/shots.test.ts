import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeShots, normalizeScenes, normalizeVisualCharacters } from "../lib/assets/normalize.ts"
import type { VisualCharacter } from "../lib/assets/types.ts"

function vc(name: string, anchor: string): VisualCharacter {
  return { id: name, name, age: "", face: "", hair: "", marks: "", wardrobe: "", props: "", anchor }
}

// ── B4/B5：镜头整形与锚点强制注入 ──────────────────────────────

test("B5h 模型漏写锚点时，整形阶段补回", () => {
  const visuals = [vc("张三", "wearing: 沙色短夹克")]
  const raw = { shots: [{ shot: 1, scene: "咖啡馆", characters: ["张三"], action: "推门", camera: "中景", prompt: "man opening a door" }] }
  const shots = normalizeShots({ raw, visuals, stamp: 1 })
  assert.ok(shots[0].prompt.includes("wearing: 沙色短夹克"))
})

test("B5i 模型改写锚点时，原始锚点仍被追加", () => {
  const visuals = [vc("张三", "wearing: 沙色短夹克")]
  const raw = { shots: [{ shot: 1, scene: "s", characters: ["张三"], action: "a", camera: "中景", prompt: "man in a beige jacket" }] }
  const shots = normalizeShots({ raw, visuals, stamp: 1 })
  assert.ok(shots[0].prompt.includes("wearing: 沙色短夹克"))
  assert.ok(shots[0].prompt.includes("beige jacket"))
})

test("B4b 镜号以数组下标为准，不信任模型写的 number", () => {
  const raw = { shots: [
    { shot: 99, scene: "a", characters: [], action: "", camera: "中景", prompt: "" },
    { shot: 99, scene: "b", characters: [], action: "", camera: "中景", prompt: "" },
  ] }
  const shots = normalizeShots({ raw, visuals: [], stamp: 1 })
  assert.deepEqual(shots.map((s) => s.shot), [1, 2])
})

test("B4c 非法运镜与非法景别都各自兜底，不能互相串台", () => {
  const raw = { shots: [{ shot: 1, scene: "s", characters: [], action: "", camera: "缓慢推进让人紧张", prompt: "" }] }
  const shots = normalizeShots({ raw, visuals: [], stamp: 1 })
  assert.equal(shots[0].camera, "固定", "非法运镜要回落到「固定」")
  assert.equal(shots[0].shotSize, "中景", "缺景别时给一个能用的默认景别")
})

test("B4d 合法运镜与合法景别都被保留", () => {
  const raw = { shots: [{ shot: 1, scene: "s", characters: [], action: "", shotSize: "近景", camera: "推", prompt: "" }] }
  const s = normalizeShots({ raw, visuals: [], stamp: 1 })[0]
  assert.equal(s.camera, "推")
  assert.equal(s.shotSize, "近景")
})

test("B4e 旧数据把景别写在 camera 里时，要挪进 shotSize 而不是丢掉", () => {
  // 真实存在过的历史数据：早期版本只有一个 camera 字段，"中景" 这类景别也写在那里
  const raw = { shots: [{ shot: 1, scene: "s", characters: [], action: "", camera: "中景", prompt: "" }] }
  const s = normalizeShots({ raw, visuals: [], stamp: 1 })[0]
  assert.equal(s.shotSize, "中景", "景别不能丢，要迁移到 shotSize")
  assert.equal(s.camera, "固定", "运镜位置得给一个安全的默认值")
})

test("B6b 有参考图时标注「角色·图标签」", () => {
  const refMap = new Map([["张三", ["定妆正面"]], ["李四", ["定妆正面", "侧脸"]]])
  const raw = { shots: [{ shot: 1, scene: "s", characters: ["张三", "李四"], action: "", camera: "中景", prompt: "" }] }
  const shots = normalizeShots({ raw, visuals: [], refMap, stamp: 1 })
  assert.deepEqual(shots[0].refImages, ["张三·定妆正面", "李四·定妆正面", "李四·侧脸"])
  assert.deepEqual(shots[0].missingRefFor, [])
})

test("B6c 缺参考图的角色被显式记录，不静默", () => {
  const refMap = new Map([["张三", ["定妆正面"]]])
  const raw = { shots: [{ shot: 1, scene: "s", characters: ["张三", "李四"], action: "", camera: "中景", prompt: "" }] }
  const shots = normalizeShots({ raw, visuals: [], refMap, stamp: 1 })
  assert.deepEqual(shots[0].missingRefFor, ["李四"])
})

test("B4e 流式下同一 stamp 保证 id 稳定", () => {
  const raw = { shots: [{ shot: 1, scene: "s", characters: [], action: "", camera: "中景", prompt: "" }] }
  const a = normalizeShots({ raw, visuals: [], stamp: 777 })
  const b = normalizeShots({ raw, visuals: [], stamp: 777 })
  assert.equal(a[0].id, b[0].id)
})

test("B4f 默认参数：竖屏 9:16、时长 10 秒、状态 todo", () => {
  const raw = { shots: [{ shot: 1, scene: "s", characters: [], action: "", camera: "中景", prompt: "" }] }
  const s = normalizeShots({ raw, visuals: [], stamp: 1 })[0]
  assert.deepEqual(s.params, { ratio: "9:16", duration: 10, lastFrame: false })
  assert.equal(s.status, "todo")
})

// ── B3：场次整形 ────────────────────────────────────────────────

test("B3b 场次整形：缺字段补齐，number 按顺序", () => {
  const scenes = normalizeScenes({ scenes: [
    { location: "咖啡馆", timeOfDay: "日", summary: "相遇", characters: ["张三", "李四"] },
    { location: "", timeOfDay: "", summary: "", characters: [] },
  ] })
  assert.equal(scenes.length, 2)
  assert.equal(scenes[0].number, 1)
  assert.equal(scenes[1].location, "地点待补充")
})

// ── B1：视觉锚点整形 ───────────────────────────────────────────

test("B1e 视觉锚点：模型没给 anchor 时自动编译", () => {
  const raw = { visualCharacters: [{ name: "张三", age: "28岁", wardrobe: "沙色短夹克" }] }
  const vcs = normalizeVisualCharacters(raw, ["张三"])
  assert.equal(vcs[0].name, "张三")
  assert.equal(vcs[0].anchor, "age: 28岁, wearing: 沙色短夹克")
})

test("B1f 视觉锚点：模型给了 anchor 就尊重它", () => {
  const raw = { visualCharacters: [{ name: "张三", anchor: "custom anchor" }] }
  assert.equal(normalizeVisualCharacters(raw, ["张三"])[0].anchor, "custom anchor")
})
