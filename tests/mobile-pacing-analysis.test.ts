import assert from "node:assert/strict"
import test from "node:test"

import { analyzeEpisodePacing } from "../lib/mobile-pacing.ts"

const episodes = [
  { number: 1, title: "门缝里的车票", synopsis: "陈默送件", hook: "门里伸出一只手，把一张四十年前的车票塞回他掌心。", intensity: 3 },
  { number: 2, title: "不肯开门的人", synopsis: "苏婉拒绝", hook: "门关上了。", intensity: 5 },
]

const shots = [
  { episode: 1, dialogue: "你好，有你的快递。", params: { duration: 5 } },
  { episode: 1, dialogue: "放门口。", params: { duration: 5 } },
  { episode: 2, dialogue: "这封信不是给我的。你走吧，以后也不要再来。", params: { duration: 10 } },
  { episode: 2, dialogue: "", params: { duration: 10 } },
]

test("按集计算钩子、对白密度、平均镜头时长和集尾悬念", () => {
  const result = analyzeEpisodePacing({ episodes, shots })

  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].episode, 1)
  assert.equal(result.rows[0].shotCount, 2)
  assert.equal(result.rows[0].averageShotSeconds, 5)
  assert.equal(result.rows[0].dialogueCharsPerShot, 7)
  assert.equal(result.rows[0].hookStatus, "good")
  assert.equal(result.rows[0].endingSuspense, "open")

  assert.equal(result.rows[1].averageShotSeconds, 10)
  assert.equal(result.rows[1].dialogueCharsPerShot, 11)
  assert.equal(result.rows[1].hookStatus, "short")
  assert.equal(result.rows[1].endingSuspense, "short")
})

test("节奏分析指出偏慢、对白过密和缺少镜头", () => {
  const result = analyzeEpisodePacing({
    episodes,
    shots: [
      { episode: 1, dialogue: "一".repeat(120), params: { duration: 15 } },
      { episode: 2, dialogue: "", params: { duration: 15 } },
    ],
  })

  assert.ok(result.rows[0].observations.some((item) => item.includes("对白密度偏高")))
  assert.ok(result.rows[0].observations.some((item) => item.includes("镜头偏长")))
  assert.ok(result.rows[0].observations.some((item) => item.includes("镜头不足")))
  assert.ok(result.warnings.length >= 3)
})
