import assert from "node:assert/strict"
import test from "node:test"

import { buildMobileAgentMemory } from "../lib/mobile-memory.ts"

test("Agent 记忆层汇总锁定资产、决策、否决方向和开放批注", () => {
  const memory = buildMobileAgentMemory({
    visualCharacters: [
      { name: "林昭", wardrobe: "深蓝快递服", marks: "左眉浅疤" },
      { name: "", wardrobe: "忽略", marks: "" },
    ],
    visualPlaces: [
      { name: "旧楼门口", space: "狭窄门廊", lighting: "冷白感应灯" },
    ],
    decisions: [
      {
        step: "shots",
        question: "第 3 集钩子",
        chosenValue: "车票留在门缝",
        reason: "比直接解释人物关系更有悬念",
        status: "accepted",
        locked: false,
      },
      {
        step: "characters",
        question: "林昭关系",
        chosenValue: "母女",
        reason: "已锁定",
        status: "accepted",
        locked: true,
      },
    ],
    judgments: [
      { step: "shots", action: "否决反转", reason: "前两集没有铺垫" },
      { step: "visuals", action: "采用冷色方案", reason: "更贴近夜戏" },
    ],
    comments: [
      { targetName: "第 3 集 · 第 3 镜", body: "门口不要太亮" },
    ],
  })

  assert.equal(memory.lockedCharacters[0], "林昭 · 深蓝快递服 · 左眉浅疤")
  assert.equal(memory.lockedPlaces[0], "旧楼门口 · 狭窄门廊 · 冷白感应灯")
  assert.match(memory.acceptedDecisions[0], /车票留在门缝/)
  assert.match(memory.lockedDecisions[0], /母女/)
  assert.equal(memory.rejectedDirections[0], "否决反转：前两集没有铺垫")
  assert.equal(memory.openComments[0], "第 3 集 · 第 3 镜：门口不要太亮")
})
