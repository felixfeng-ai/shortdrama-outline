import { test } from "node:test"
import assert from "node:assert/strict"

import {
  EMPTY_BRIEF,
  briefPromptBlock,
  briefSignature,
  readBrief,
} from "../lib/brief.ts"
import {
  buildCharacterPrompt,
  buildActPrompt,
  buildEpisodePrompt,
} from "../lib/prompts.ts"
import type { Act, Character } from "../lib/types.ts"

const characters: Character[] = [
  { id: "c1", name: "陈默", identity: "快递员", personality: "沉默", motivation: "证明自己", arc: "主动放弃" },
]
const acts: Act[] = [
  { id: "a1", key: "setup", title: "第一幕", summary: "接到遗产", beats: ["雨夜", "铁门"] },
]

test("B1 空意图不产生任何 prompt 片段", () => {
  assert.equal(briefPromptBlock(EMPTY_BRIEF), "")
  assert.equal(briefPromptBlock(undefined), "")
})

test("B2 填写的字段进入 prompt 块", () => {
  const block = briefPromptBlock({
    emotion: "克制",
    audience: "25-35 女性",
    references: "小偷家族、步履不停",
    redline: "不要爽剧式打脸",
  })
  assert.match(block, /核心情绪：克制/)
  assert.match(block, /目标观众：25-35 女性/)
  assert.match(block, /参考气质：小偷家族、步履不停/)
  assert.match(block, /不要变成：不要爽剧式打脸/)
  assert.match(block, /倾向，不覆盖结构要求/)
})

test("B3 参考片最多保留 3 个，按顿号归一", () => {
  const brief = readBrief({ references: "a,b，c、d；e" })
  assert.equal(brief.references, "a、b、c")
})

test("B4 任何字段变化都会改变签名", () => {
  assert.equal(briefSignature(EMPTY_BRIEF), briefSignature({ ...EMPTY_BRIEF }))
  assert.notEqual(
    briefSignature({ ...EMPTY_BRIEF, emotion: "克制" }),
    briefSignature({ ...EMPTY_BRIEF, emotion: "荒诞" }),
  )
})

test("B5 空意图时三步 prompt 与不传完全一致", () => {
  const c1 = buildCharacterPrompt("快递员")
  const c2 = buildCharacterPrompt("快递员", undefined, EMPTY_BRIEF)
  const a1 = buildActPrompt("快递员", characters)
  const a2 = buildActPrompt("快递员", characters, undefined, EMPTY_BRIEF)
  const e1 = buildEpisodePrompt("快递员", characters, acts)
  const e2 = buildEpisodePrompt("快递员", characters, acts, undefined, { brief: EMPTY_BRIEF })
  assert.equal(c1.system, c2.system)
  assert.equal(c1.user, c2.user)
  assert.equal(a1.system, a2.system)
  assert.equal(a1.user, a2.user)
  assert.equal(e1.system, e2.system)
  assert.equal(e1.user, e2.user)
})

test("B6 有意图时三步 prompt 都带上约束", () => {
  const brief = { emotion: "克制", audience: "25-35 女性", references: "", redline: "" }
  assert.match(buildCharacterPrompt("快递员", undefined, brief).system, /核心情绪：克制/)
  assert.match(buildActPrompt("快递员", characters, undefined, brief).system, /目标观众：25-35 女性/)
  assert.match(buildEpisodePrompt("快递员", characters, acts, undefined, { brief }).system, /核心情绪：克制/)
})
