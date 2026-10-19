import { test } from "node:test"
import assert from "node:assert/strict"

import {
  MAX_JUDGMENTS,
  appendJudgment,
  judgmentPromptBlock,
  readJudgments,
  type JudgmentEntry,
} from "../lib/judgment-log.ts"

test("J1 追加记录，最多保留最近 10 条", () => {
  let list: JudgmentEntry[] = []
  for (let i = 0; i < 14; i++) {
    list = appendJudgment(list, { step: "characters", action: `换第 ${i} 个`, now: 1000 + i })
  }
  assert.equal(list.length, MAX_JUDGMENTS)
  assert.equal(list[list.length - 1].action, "换第 13 个")
})

test("J2 空日志不产生 prompt 片段", () => {
  assert.equal(judgmentPromptBlock([]), "")
})

test("J3 prompt 片段包含步骤、动作与理由", () => {
  const list = appendJudgment([], {
    step: "acts",
    action: "否决了黑暗结局",
    reason: "太苦",
    now: 1,
  })
  const block = judgmentPromptBlock(list)
  assert.match(block, /\[acts\]/)
  assert.match(block, /否决了黑暗结局/)
  assert.match(block, /太苦/)
  assert.match(block, /不要重复推荐/)
})

test("J4 非法存储数据被安全读回", () => {
  assert.deepEqual(readJudgments(null), [])
  assert.deepEqual(readJudgments([{ step: 1 }, null, { step: "shots", action: "重跑" }]).length, 1)
})
