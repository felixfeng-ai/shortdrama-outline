import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  buildVariantDecisionInput,
  buildVariantMemoryBlock,
  readVariantStrategy,
  variantPromptBlock,
} from "../lib/variant-decision.ts"

const read = (file: string) => fs.readFileSync(file, "utf8")

test("VM1 双版本试稿不落正式快照，选定后才保存选中版本", () => {
  const charactersRoute = read("app/api/characters/route.ts")
  const actsRoute = read("app/api/acts/route.ts")
  const episodesRoute = read("app/api/episodes/route.ts")
  const page = read("app/page.tsx")

  assert.match(charactersRoute, /comparison/)
  assert.match(charactersRoute, /if \(!comparison\)/)
  assert.match(actsRoute, /comparison/)
  assert.match(actsRoute, /if \(!comparison\)/)
  assert.match(episodesRoute, /comparison/)
  assert.match(episodesRoute, /if \(!comparison && !preview\)/)

  assert.match(page, /comparison: true/)
  assert.match(page, /variantStrategy: 'contract'/)
  assert.match(page, /variantStrategy: 'conflict'/)
  assert.match(page, /saveSnapshot\(session\.projectId/)
})

test("VM2 比较卡显示稳守契约与强化冲突，不展示伪评分", () => {
  const picker = read("components/VariantPicker.tsx")
  const page = read("app/page.tsx")

  assert.match(picker, /o\.direction/)
  assert.match(picker, /两版都遵守创作契约/)
  assert.match(page, /稳守契约/)
  assert.match(page, /强化冲突/)
  assert.doesNotMatch(picker, /评分|得分|胜出/)
})

test("VM3 选定版本创建 accepted 决策，不再额外写第二条判断日志", () => {
  const page = read("app/page.tsx")

  assert.match(page, /buildVariantDecisionInput/)
  assert.match(page, /createProjectDecision\(session\.projectId/)
  assert.match(page, /status: 'accepted'|status: \"accepted\"/)
  assert.doesNotMatch(page, /recordJudgment\(session\.step, `选定/)
  assert.doesNotMatch(page, /recordJudgment\('episodes', `选定第一集/)
})

test("VM4 后续生成读取项目判断，并注入不同的版本方向", () => {
  const charactersRoute = read("app/api/characters/route.ts")
  const actsRoute = read("app/api/acts/route.ts")
  const episodesRoute = read("app/api/episodes/route.ts")

  for (const route of [charactersRoute, actsRoute, episodesRoute]) {
    assert.match(route, /buildVariantMemoryBlock/)
    assert.match(route, /variantPromptBlock/)
    assert.match(route, /listProjectDecisions/)
    assert.match(route, /listProjectJudgments/)
  }
})

test("VM4b 两版方向明确不同，决选择保留被放弃方向和理由", () => {
  assert.equal(readVariantStrategy("conflict"), "conflict")
  assert.equal(readVariantStrategy("unexpected"), "contract")
  assert.match(variantPromptBlock("contract"), /稳守契约/)
  assert.match(variantPromptBlock("contract"), /动机完整/)
  assert.match(variantPromptBlock("conflict"), /强化冲突/)
  assert.match(variantPromptBlock("conflict"), /故事承诺/)

  const decision = buildVariantDecisionInput({
    step: "characters",
    stepLabel: "核心人物",
    chosen: "B",
    reason: "这一版人物对抗更强",
    options: [
      { id: "A", strategy: "contract", summary: "陈默、苏婉、沈之遥" },
      { id: "B", strategy: "conflict", summary: "陈默、苏婉、沈之遥、韩秋" },
    ],
  })

  assert.equal(decision.status, "accepted")
  assert.equal(decision.options.length, 2)
  assert.equal(decision.chosenValue, decision.options[1])
  assert.match(decision.options[0], /稳守契约/)
  assert.match(decision.chosenValue, /强化冲突/)
  assert.equal(decision.reason, "这一版人物对抗更强")
})

test("VM4c 判断记忆最多注入五条，并排除无关步骤与重复日志", () => {
  const decisions = Array.from({ length: 4 }, (_, index) => ({
    step: index % 2 === 0 ? "characters" : "acts",
    question: `问题 ${index}`,
    options: [`A${index}`, `B${index}`],
    chosenValue: `A${index}`,
    reason: `理由 ${index}`,
    status: "accepted",
  }))
  const block = buildVariantMemoryBlock("acts", decisions, [
    {
      step: "acts",
      action: "已有决策日志",
      reason: "不应重复",
      decisionId: "decision-1",
    },
    {
      step: "shots",
      action: "无关镜头判断",
      reason: "不应出现",
      decisionId: null,
    },
    {
      step: "acts",
      action: "旧的手动判断",
      reason: "反转太硬",
      decisionId: null,
    },
  ])

  assert.equal((block.match(/^- /gm) || []).length, 5)
  assert.match(block, /旧的手动判断/)
  assert.match(block, /反转太硬/)
  assert.doesNotMatch(block, /已有决策日志/)
  assert.doesNotMatch(block, /无关镜头判断/)
})
