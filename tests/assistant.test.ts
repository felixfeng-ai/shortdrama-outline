import { test } from "node:test"
import assert from "node:assert/strict"

import { buildAssistantPrompt, parseAssistantReply, readQuestion, MAX_QUESTION } from "../lib/assistant.ts"

// ── A1 提问校验 ──
// 助手每次调用都在花真钱，空提问必须在进模型之前就被拦住。

test("A1 readQuestion 拒绝空提问与超长提问", () => {
  assert.throws(() => readQuestion(""), /说清楚/)
  assert.throws(() => readQuestion("  "), /说清楚/)
  assert.throws(() => readQuestion("好"), /说清楚/)
  assert.throws(() => readQuestion("字".repeat(MAX_QUESTION + 1)), /太长/)
  assert.equal(readQuestion("  这一镜雨再大一点  "), "这一镜雨再大一点")
})

// ── A2 提示词必须带上「当前这一镜」的完整上下文 ──

test("A2 buildAssistantPrompt 带上镜头上下文与提问", () => {
  const { system, user } = buildAssistantPrompt("这一镜雨再大一点", {
    idea: "快递员继承百万遗产",
    genre: { id: "suspense", label: "悬疑", hint: "信息差驱动" },
    shot: {
      shot: 3,
      scene: "别墅门外",
      characters: ["陈默"],
      action: "撑伞站在铁门外",
      shotSize: "中景",
      camera: "固定",
      prompt: "medium shot, CHEN MO standing outside an iron gate",
      ratio: "9:16",
      duration: 5,
    },
    characters: [{ name: "陈默", identity: "快递员", personality: "沉默" }],
  })

  assert.ok(system.includes("JSON"), "system 必须交代输出 JSON")
  assert.ok(system.includes("applyTarget"), "system 必须交代写回目标")
  assert.ok(user.includes("这一镜雨再大一点"), "user 必须带用户提问")
  assert.ok(user.includes("别墅门外"), "user 必须带镜头场景")
  assert.ok(user.includes("CHEN MO"), "user 必须带已有英文提示词，模型才能在其上改写")
  assert.ok(user.includes("景别：中景"), "user 必须把景别单独交代清楚，别和运镜混在一起")
  assert.ok(user.includes("悬疑"), "user 必须带题材")
  assert.ok(user.includes("陈默"), "user 必须带角色锚点")
})

test("A2b 没有选中镜头时明确要求不许写回", () => {
  const { user } = buildAssistantPrompt("这个故事还能怎么反转", { idea: "继承遗产" })
  assert.ok(user.includes("还没选中镜头"), "应当显式告诉模型没有当前镜头")
  assert.ok(user.includes("必须是 none"), "没有镜头时必须禁止写回")
})

// ── A3 解析兜底 ──
// 模型输出不可靠：字段名会飘、会包围栏、会在 none 时多塞一段文本。
// 最后一种最危险——界面会拿一段解释去覆盖用户的提示词。

test("A3 parseAssistantReply 正常对象", () => {
  const r = parseAssistantReply({ reply: "已加大雨势", applyTarget: "prompt", newText: "heavy rain, CHEN MO ..." })
  assert.deepEqual(r, { reply: "已加大雨势", applyTarget: "prompt", newText: "heavy rain, CHEN MO ..." })
})

test("A3b 字段名飘了也要认（answer / text）", () => {
  assert.equal(parseAssistantReply({ answer: "雨天更压抑" }).reply, "雨天更压抑")
  assert.equal(parseAssistantReply({ text: "换个景别更近" }).reply, "换个景别更近")
})

test("A3c applyTarget 非法 → none，且丢掉 newText", () => {
  const r = parseAssistantReply({ reply: "解释一下", applyTarget: "rewrite", newText: "不该被应用的文本" })
  assert.equal(r.applyTarget, "none")
  assert.equal(r.newText, "", "非法目标时绝不能留下可写回的文本")
})

test("A3d none 时即使给了 newText 也必须丢掉", () => {
  const r = parseAssistantReply({ reply: "这镜不需要改", applyTarget: "none", newText: "多余文本" })
  assert.equal(r.applyTarget, "none")
  assert.equal(r.newText, "")
})

test("A3e 只有 newText 没有说明时，也要能用", () => {
  const r = parseAssistantReply({ applyTarget: "action", newText: "他把伞收起来走进雨里" })
  assert.equal(r.applyTarget, "action")
  assert.ok(r.reply.length > 0, "缺 reply 时必须给一句兜底文案，不能空着")
})

test("A3f 模型直接回了字符串也不能崩", () => {
  const r = parseAssistantReply("这一镜建议改成近景")
  assert.equal(r.applyTarget, "none")
  assert.equal(r.newText, "")
  assert.equal(r.reply, "这一镜建议改成近景")
})
