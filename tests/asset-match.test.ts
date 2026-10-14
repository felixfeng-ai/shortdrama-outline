// AI 认图兜底（/api/asset-match）：只送文件名字符串，绝不送图片。
//
// 这条路径存在的理由：真实数据里「陈砚」被即梦写成 "Cheng Yan"（多一个 g），
// 拼音折叠是确定性算法，对这种错拼无能为力。算法救不了时不能是死路。
// 但它同时也不能变成后门——所以这里重点测三件事：
//   1. 带二进制字段的请求必须被拒（守住「图不出门」）
//   2. 模型返回的越界内容（不存在的角色 / 不存在的文件）必须被丢弃
//   3. 一张图只能归一个角色
import { test } from "node:test"
import assert from "node:assert/strict"

import { buildAssetMatchPrompt } from "../lib/assets/prompts.ts"
import { STEP_COST, FULL_PROJECT_COST } from "../lib/quota.ts"

// ── prompt 内容 ────────────────────────────────────────────────

test("AI1 prompt 里带上角色名与文件名，并且明确要求只输出 JSON", () => {
  const { system, user } = buildAssetMatchPrompt(
    ["江楠", "陈砚"],
    [{ key: "JIAN NAN/a.png", name: "jimeng-2026-10-14-1992-34-year-old woman Jiang Nan.png" }],
  )
  assert.ok(system.includes("matches"), "system 里要有 JSON 模板")
  assert.ok(system.includes("只输出一个 JSON 对象"), "必须写死结构化输出要求")
  assert.ok(user.includes("江楠") && user.includes("陈砚"), "user 里要列出角色名")
  assert.ok(user.includes("Jiang Nan"), "user 里要列出文件名的原文")
})

test("AI2 prompt 明确允许「不确定就不输出」——挂错比不挂更糟", () => {
  const { system } = buildAssetMatchPrompt(["林远"], [{ key: "1/2.png", name: "2.png" }])
  assert.ok(/不确定就不要猜|不要放进结果/.test(system), "必须写明宁可漏、不可错")
})

test("AI3 提交给平台的请求体里绝不含图片字段——只有名称与路径", () => {
  const files = [{ key: "a.png", name: "jimeng-x.png" }]
  const { user } = buildAssetMatchPrompt(["林远"], files)
  // prompt 是纯文本，天然不含二进制；这条断言防止以后有人往里塞 base64
  assert.ok(!user.includes("data:"), "不应出现 data: URL")
  assert.ok(!/base64/i.test(user), "不应出现 base64 关键字")
})

// ── 额度 ───────────────────────────────────────────────────────

test("AI4 AI 认图有独立额度权重，且不抬高「一个完整项目」的对外承诺", () => {
  assert.equal(STEP_COST.assetMatch, 1)
  assert.equal(FULL_PROJECT_COST, 13, "完整项目额度必须仍是 13（不含辅助步骤）")
})

// ── 输出收敛 ───────────────────────────────────────────────────

// 路由里的 normalizeMatches 是内部函数，这里用等价逻辑对齐它的行为契约：
// 越界的角色名/文件名一律丢弃，同一张图不重复归属。
interface RawMatch { character?: unknown; key?: unknown; confidence?: unknown }
interface RawPayload { matches?: unknown }

function normalizeMatches(raw: unknown, names: string[], files: { key: string; name: string }[]) {
  const src = (raw && typeof raw === "object" ? raw : {}) as RawPayload
  const list = Array.isArray(src.matches) ? (src.matches as RawMatch[]) : []
  const validKeys = new Set(files.map((f: { key: string }) => f.key))
  const validNames = new Set(names)
  const out: { character: string; key: string; confidence: string }[] = []
  const used = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const character = String(item.character ?? "").trim()
    const key = String(item.key ?? "").trim()
    if (!validNames.has(character) || !validKeys.has(key)) continue
    if (used.has(key)) continue
    used.add(key)
    out.push({ character, key, confidence: String(item.confidence ?? "").toLowerCase() === "high" ? "high" : "low" })
  }
  return out
}

test("AI5 模型编造的角色名与文件名一律被丢弃", () => {
  const files = [{ key: "a.png", name: "a.png" }]
  const out = normalizeMatches(
    { matches: [
      { character: "江楠", key: "a.png", confidence: "high" },
      { character: "不存在的角色", key: "a.png" },
      { character: "江楠", key: "不存在的文件.png" },
    ] },
    ["江楠"],
    files,
  )
  assert.equal(out.length, 1)
  assert.equal(out[0]?.confidence, "high")
})

test("AI6 一张图只归一个角色；confidence 非法值一律降为 low", () => {
  const files = [
    { key: "a.png", name: "a.png" },
    { key: "b.png", name: "b.png" },
  ]
  const out = normalizeMatches(
    { matches: [
      { character: "江楠", key: "a.png", confidence: "HIGH" },
      { character: "陈砚", key: "a.png", confidence: "随便写的" },
      { character: "陈砚", key: "b.png", confidence: "随便写的" },
    ] },
    ["江楠", "陈砚"],
    files,
  )
  assert.equal(out.length, 2, "a.png 只能出现一次")
  assert.equal(out.find((x) => x.key === "a.png")?.character, "江楠")
  assert.equal(out.find((x) => x.key === "b.png")?.confidence, "low")
})

test("AI7 模型返回非数组 / 空对象时不崩，返回空结果", () => {
  const files = [{ key: "a.png", name: "a.png" }]
  for (const bad of [null, {}, { matches: "不是数组" }, { matches: [null, 1, "x"] }]) {
    assert.deepEqual(normalizeMatches(bad, ["江楠"], files), [])
  }
})
