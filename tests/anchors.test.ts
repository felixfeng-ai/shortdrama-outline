import { test } from "node:test"
import assert from "node:assert/strict"
import { compileAnchor, injectAnchor, hasAllAnchors, countShotsMissingAnchors } from "../lib/assets/anchors.ts"
import type { VisualCharacter } from "../lib/assets/types.ts"

function vc(over: Partial<VisualCharacter> = {}): VisualCharacter {
  return {
    id: "vc-1", name: "张三",
    age: "28岁", face: "偏长脸、窄眼", hair: "黑色短发、齐耳",
    marks: "左眉尾浅疤", wardrobe: "沙色短夹克", props: "钴蓝色硬壳笔记本",
    anchor: "", ...over,
  }
}

// ── B1：锚点可编译，且幂等 ──────────────────────────────────────

test("B1 编译出英文锚点串，字段顺序固定", () => {
  const a = compileAnchor(vc())
  assert.match(a, /^age: 28岁, face: 偏长脸、窄眼, hair: 黑色短发、齐耳, distinguishing feature: 左眉尾浅疤, wearing: 沙色短夹克, carrying: 钴蓝色硬壳笔记本$/)
})

test("B1b 幂等：同一角色编译两次逐字相同", () => {
  assert.equal(compileAnchor(vc()), compileAnchor(vc()))
})

test("B1c 空字段被跳过，不产生 undefined", () => {
  const a = compileAnchor(vc({ age: "", marks: "   ", props: "" }))
  assert.ok(!a.includes("undefined"))
  assert.ok(!a.includes("age"))
  assert.ok(a.includes("wearing: 沙色短夹克"))
})

test("B1d 全空时返回空串", () => {
  assert.equal(compileAnchor(vc({ age: "", face: "", hair: "", marks: "", wardrobe: "", props: "" })), "")
})

// ── B5：prompt 必须内嵌 anchor ─────────────────────────────────

test("B5 注入锚点：未包含则追加", () => {
  const out = injectAnchor("A young man opening a door", "wearing: 沙色短夹克")
  assert.ok(out.includes("wearing: 沙色短夹克"))
  assert.ok(out.startsWith("A young man opening a door"))
})

test("B5b 已包含则不重复注入", () => {
  const anchor = "wearing: 沙色短夹克"
  const p = `A young man, ${anchor}, cinematic`
  const out = injectAnchor(p, anchor)
  assert.equal(out, p)
  assert.equal(out.split(anchor).length - 1, 1)
})

test("B5c 空锚点不影响原 prompt", () => {
  assert.equal(injectAnchor("  A shot  ", ""), "A shot")
})

test("B5d 空 prompt 时只返回锚点", () => {
  assert.equal(injectAnchor("", "wearing: 红裙"), "wearing: 红裙")
})

test("B5e hasAllAnchors：模型改写锚点时应判为 false", () => {
  const visuals = [vc({ anchor: "wearing: 沙色短夹克" })]
  assert.equal(hasAllAnchors("man in sand jacket", ["张三"], visuals), false)
  assert.equal(hasAllAnchors("man, wearing: 沙色短夹克", ["张三"], visuals), true)
})

test("B5f hasAllAnchors：无锚点的角色不参与判断", () => {
  const visuals = [vc({ name: "李四", anchor: "" })]
  assert.equal(hasAllAnchors("anything", ["李四"], visuals), true)
})

test("B5g hasAllAnchors：多个角色都要满足", () => {
  const visuals = [vc({ anchor: "wearing: 沙色短夹克" }), vc({ name: "李四", anchor: "hair: 银灰长发" })]
  assert.equal(hasAllAnchors("wearing: 沙色短夹克", ["张三", "李四"], visuals), false)
  assert.equal(hasAllAnchors("wearing: 沙色短夹克, hair: 银灰长发", ["张三", "李四"], visuals), true)
})

// ── B5h：改一处之后「有几个镜头要做」要算得出来 ─────────────────

const shot = (over: { prompt?: string; characters?: string[] } = {}) => ({
  prompt: "wearing: 沙色短夹克", characters: ["张三"], ...over,
})

test("B5h 缺锚点的镜头被数出来，而不是数「没做完的镜头」", () => {
  const visuals = [vc({ anchor: "wearing: 沙色短夹克" })]
  assert.equal(countShotsMissingAnchors([shot()], visuals), 0)
  // 提示词被模型改写过（沙色短夹克 → 米色外套），即使这一镜已经做完也算过期
  assert.equal(countShotsMissingAnchors([shot({ prompt: "man in beige jacket" })], visuals), 1)
})

test("B5i 混排：只数缺锚点的那几镜", () => {
  const visuals = [vc({ anchor: "wearing: 沙色短夹克" })]
  const shots = [
    shot(),                                                        // 命中
    shot({ prompt: "wide shot of the street", characters: [] }),    // 没有出场角色，不参与
    shot({ prompt: "close up, no anchor here" }),                   // 缺
    shot({ characters: ["李四"], prompt: "portrait" }),             // 李四没锚点，不参与
  ]
  assert.equal(countShotsMissingAnchors(shots, visuals), 1)
})

test("B5j 没有任何锚点时一律不算过期，不误报", () => {
  const visuals = [vc({ anchor: "" })]
  assert.equal(countShotsMissingAnchors([shot({ prompt: "anything" })], visuals), 0)
})
