import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  EMPTY_BRIEF,
  briefPromptBlock,
  briefSignature,
  isBriefEmpty,
  readBrief,
} from "../lib/brief.ts"
import { buildActPrompt, buildCharacterPrompt, buildEpisodePrompt } from "../lib/prompts.ts"
import { buildScenePrompt, buildShotPrompt } from "../lib/assets/prompts.ts"

test("CC1 旧四字段项目可读取，新字段为空且不破坏原内容", () => {
  const legacy = readBrief({
    emotion: "克制",
    audience: "25-35 女性",
    references: "漫长的季节、白日焰火、平原上的摩西、多余项",
    redline: "不要爽剧式打脸",
  })

  assert.equal(legacy.emotion, "克制")
  assert.equal(legacy.audience, "25-35 女性")
  assert.equal(legacy.references, "漫长的季节、白日焰火、平原上的摩西")
  assert.equal(legacy.redline, "不要爽剧式打脸")
  assert.equal(legacy.premise, "")
  assert.equal(legacy.payoff, "")
  assert.equal(legacy.destination, "")
})

test("CC2 七字段归一化、长度限制与空态判定一致", () => {
  const contract = readBrief({
    premise: `  一个快递员想拿回女儿的手术费，却被迫替陌生人送一封不能拆的信。${"长".repeat(180)}  `,
    payoff: "  每次以为真相揭开时，都会发现主角离危险更近一步  ",
    destination: "  从只想活命，走到愿意为真相承担代价  ",
  })

  assert.equal(contract.premise.length, 160)
  assert.ok(contract.premise.startsWith("一个快递员想拿回女儿的手术费"))
  assert.equal(contract.payoff, "每次以为真相揭开时，都会发现主角离危险更近一步")
  assert.equal(contract.destination, "从只想活命，走到愿意为真相承担代价")
  assert.equal(isBriefEmpty(contract), false)
  assert.equal(isBriefEmpty(EMPTY_BRIEF), true)
})

test("CC2 任一契约字段变化都会改变签名", () => {
  const base = readBrief({ ...EMPTY_BRIEF, emotion: "克制" })
  const changed = readBrief({ ...EMPTY_BRIEF, emotion: "克制", payoff: "每集揭一层旧案" })

  assert.notEqual(briefSignature(base), briefSignature(changed))
})

test("CC3 空契约不产生 Prompt 片段，V2 字段按已填写内容注入", () => {
  assert.equal(briefPromptBlock(EMPTY_BRIEF), "")

  const block = briefPromptBlock(readBrief({
    premise: "快递员想拿回手术费，却被逼送一封不能拆的信",
    payoff: "每次接近真相都付出更大的代价",
    destination: "从只想活命走到愿意为真相承担代价",
    emotion: "克制",
  }))

  assert.match(block, /故事承诺/)
  assert.match(block, /追看回报/)
  assert.match(block, /最终落点/)
  assert.match(block, /核心情绪/)
  assert.match(block, /不覆盖硬结构要求/)
  assert.doesNotMatch(block, /目标观众/)
  assert.doesNotMatch(block, /不要变成/)
})

test("CC3 契约进入人物、三幕、分集、场次和分镜五类 Prompt", () => {
  const brief = readBrief({
    premise: "快递员想拿回手术费，却被逼送一封不能拆的信",
    payoff: "每次接近真相都付出更大的代价",
    destination: "从只想活命走到愿意为真相承担代价",
    emotion: "克制",
  })
  const prompts = [
    buildCharacterPrompt("快递员", undefined, brief).system,
    buildActPrompt("快递员", [], undefined, brief).system,
    buildEpisodePrompt("快递员", [], [], undefined, { brief }).system,
    buildScenePrompt("快递员", [], [], undefined, brief).system,
    buildShotPrompt("快递员", [], [], [], undefined, brief).system,
  ]

  for (const prompt of prompts) {
    assert.match(prompt, /故事承诺：快递员想拿回手术费/)
    assert.match(prompt, /追看回报：每次接近真相都付出更大的代价/)
  }
})

test("CC6 现有意图卡升级为七字段创作契约，并显示核心就绪状态", () => {
  const source = fs.readFileSync("components/BriefCard.tsx", "utf8")

  assert.match(source, /创作契约/)
  assert.match(source, /故事承诺/)
  assert.match(source, /追看回报/)
  assert.match(source, /最终落点/)
  assert.match(source, /核心契约已就绪/)
  assert.match(source, /不填写时仍按原流程生成/)
})

test("CC3 场次接口和 Skill 入口都把创作契约接到真实链路", () => {
  const scenesRoute = fs.readFileSync("app/api/scenes/route.ts", "utf8")
  const skillCatalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")

  assert.match(scenesRoute, /readBrief\(body\?\.brief\)/)
  assert.match(scenesRoute, /buildScenePrompt\(idea, characters, episodes, genre, brief\)/)
  assert.match(skillCatalog, /context\?\.brief\.premise/)
  assert.match(skillCatalog, /context\?\.brief\.payoff/)
  assert.match(skillCatalog, /context\?\.brief\.destination/)
})
