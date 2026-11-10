import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  INSPIRATION_AUDIENCES,
  INSPIRATION_CONSTRAINTS,
  INSPIRATION_EMOTIONS,
  buildInspirationPrompt,
  getInspirationRadar,
  normalizeCreativeSeeds,
  readInspirationInput,
} from "../lib/inspiration.ts"

test("INSP1 inspiration input keeps stable defaults and accepts guided choices", () => {
  assert.deepEqual(readInspirationInput({}), {
    audience: "unknown",
    emotion: "unknown",
    constraint: "balanced",
    keywords: "",
    genreId: "none",
    signalId: "",
  })
  const input = readInspirationInput({
    audience: "female",
    emotion: "suspense",
    constraint: "low-cost",
    keywords: "旧楼",
    genreId: "suspense",
  })
  assert.equal(input.audience, "female")
  assert.equal(input.emotion, "suspense")
  assert.equal(input.constraint, "low-cost")
  assert.ok(INSPIRATION_AUDIENCES.some((item) => item.id === input.audience))
  assert.ok(INSPIRATION_EMOTIONS.some((item) => item.id === input.emotion))
  assert.ok(INSPIRATION_CONSTRAINTS.some((item) => item.id === input.constraint))
})

test("INSP2 prompt carries market signal and forbids copying source works", () => {
  const { system, user } = buildInspirationPrompt({
    audience: "female",
    emotion: "suspense",
    constraint: "low-cost",
    keywords: "旧楼",
    genreId: "suspense",
    signalId: "female-reality-growth",
  })
  assert.ok(user.includes("旧楼"))
  assert.ok(user.includes("现实"))
  assert.ok(system.includes("不得复制"))
  assert.ok(system.includes("creativeSeeds"))
  assert.ok(system.includes("costBand"))
  assert.ok(system.includes("difficulty"))
})

test("INSP3 generated seeds are normalized, unique and limited to three", () => {
  const seeds = normalizeCreativeSeeds({
    creativeSeeds: [
      {
        title: "电梯里的陌生人",
        logline: "独居母亲发现每天同乘电梯的陌生人知道她失踪儿子的线索。",
        hook3s: "电梯门打开，陌生人叫出了她儿子的名字。",
        conflict: "她必须相信一个跟踪自己的人。",
        emotionalPayoff: "从恐惧到主动追查真相。",
        differentiation: "家庭共情叠加微悬疑。",
        genreId: "suspense",
        castCount: 3,
        locationCount: 2,
        difficulty: "low",
        costBand: "low",
        risk: "低成本室内悬疑，注意未成年人安全表达。",
      },
      {
        title: "电梯里的陌生人",
        logline: "独居母亲发现每天同乘电梯的陌生人知道她失踪儿子的线索。",
      },
      {
        title: "第二个方向",
        logline: "被辞退的法务发现公司正在销毁她母亲案件的证据。",
      },
      {
        title: "第三个方向",
        logline: "外卖员发现客户名单里藏着父亲当年的失踪路线。",
      },
      {
        title: "第四个方向",
        logline: "不应进入最终结果。",
      },
    ],
  })
  assert.equal(seeds.length, 3)
  assert.equal(new Set(seeds.map((seed) => seed.logline)).size, 3)
  assert.equal(seeds[0].costBand, "low")
  assert.equal(seeds[0].genreId, "suspense")
})

test("INSP4 radar uses structured editorial signals with source and timestamp", () => {
  const radar = getInspirationRadar()
  assert.ok(radar.signals.length >= 4)
  assert.match(radar.disclaimer, /非实时/)
  for (const signal of radar.signals) {
    assert.ok(signal.sourceLabel)
    assert.match(signal.sourceUrl, /^https:\/\//)
    assert.match(signal.capturedAt, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(signal.structure)
    assert.ok(signal.productionDifficulty)
  }
})

test("INSP5 existing and new UI surfaces stay connected", () => {
  const panel = fs.readFileSync("components/IdeaPanel.tsx", "utf8")
  const assistant = fs.readFileSync("components/IdeaOpeningAssistant.tsx", "utf8")
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")
  assert.match(panel, /IdeaOpeningAssistant/)
  assert.match(catalog, /IdeaOpeningAssistant/)
  assert.match(catalog, /applyCreativeSeed/)
  assert.match(catalog, /saveSnapshot/)
  assert.match(assistant, /帮我开题/)
  assert.match(assistant, /市场选题/)
  assert.match(assistant, /使用这个方向/)
  assert.match(assistant, /六步制作/)
  assert.match(assistant, /交给 Agent/)
  assert.match(assistant, /allowLaunchChoice/)
  assert.match(catalog, /收起开题/)
  assert.doesNotMatch(assistant, /直接写/)
  assert.doesNotMatch(assistant, /idea-opening-head/)
  assert.match(css, /\.idea-opening/)
})
