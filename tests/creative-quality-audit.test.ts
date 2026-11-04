import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { auditCreativeQuality } from "../lib/creative-audit.ts"

const characters = [
  {
    name: "陈默",
    motivation: "为了拿回女儿的手术费，替死者完成七桩交易",
    arc: "从只想活命，走到愿意为真相承担代价",
  },
  {
    name: "周放",
    motivation: "为了查清旧案，逼陈默拆开那封信",
    arc: "从利用陈默，走到与他共同承担后果",
  },
]

function episodes() {
  return [
    {
      number: 1,
      title: "最后一单",
      synopsis: "陈默冒雨送信，发现收件人三天前已经去世。",
      hook: "他转身时，门内传来死者自己的声音，而门缝里那双鞋正是葬礼上穿过的。",
      intensity: 2,
    },
    {
      number: 2,
      title: "不能拆的信",
      synopsis: "周放拦住陈默，要求他当场签收一个没有寄件人的信封。",
      hook: "信封背面写着明天的日期，还有陈默的名字。",
      intensity: 4,
    },
    {
      number: 3,
      title: "旧案记者",
      synopsis: "陈默查到周放正在调查四十年前的一桩失踪案。",
      hook: "周放打开录音笔，里面却是陈默小时候的声音。",
      intensity: 5,
    },
  ]
}

test("CQ1 正常的钩子、动机和节奏不制造问题", () => {
  const result = auditCreativeQuality({
    brief: { redline: "不要靠巧合解决问题" },
    characters,
    episodes: episodes(),
  })

  assert.equal(result.counts.error, 0)
  assert.equal(result.counts.warning, 0)
  assert.deepEqual(result.issues, [])
})

test("CQ2 空钩子、短钩子和总结式钩子被准确定位", () => {
  const result = auditCreativeQuality({
    characters,
    episodes: [
      { number: 1, title: "一", synopsis: "陈默送信。", hook: "" },
      { number: 2, title: "二", synopsis: "陈默追查。", hook: "他决定去查清楚。" },
      { number: 3, title: "三", synopsis: "陈默找到证人。", hook: "最终，陈默终于明白了整件事的真相。" },
    ],
  })

  assert.ok(result.issues.some((item) => item.code === "empty-hook" && item.episode === 1))
  assert.ok(result.issues.some((item) => item.code === "short-hook" && item.episode === 2))
  assert.ok(result.issues.some((item) => item.code === "summary-hook" && item.episode === 3))
})

test("CQ3 三集重复同一钩子开头会被指出", () => {
  const source = episodes().map((episode, index) => ({
    ...episode,
    hook: `就在这时，新的线索出现了，第 ${index + 1} 集的危险还没有结束。`,
  }))
  const result = auditCreativeQuality({ characters, episodes: source })

  const repeated = result.issues.find((item) => item.code === "repeated-hook-opening")
  assert.ok(repeated)
  assert.match(repeated!.evidence, /就在这时/)
})

test("CQ4 同一集高频套话才报告模板化表达", () => {
  const result = auditCreativeQuality({
    characters,
    episodes: [{
      number: 1,
      title: "雨夜",
      synopsis: "陈默不禁停下脚步，仿佛命运早已写好了答案。",
      hook: "他心中五味杂陈，终于明白了这句话。",
    }],
  })

  const issue = result.issues.find((item) => item.code === "template-phrases")
  assert.ok(issue)
  assert.match(issue!.evidence, /仿佛/)
  assert.match(issue!.evidence, /命运/)
})

test("CQ5 空泛或重复动机、缺失弧光会定位到角色", () => {
  const result = auditCreativeQuality({
    characters: [
      { name: "陈默", motivation: "查真相", arc: "" },
      { name: "周放", motivation: "查真相", arc: "继续查真相" },
    ],
    episodes: episodes(),
  })

  assert.ok(result.issues.some((item) =>
    item.code === "weak-motivation" && item.character === "陈默"
  ))
  assert.ok(result.issues.some((item) =>
    item.code === "duplicate-motivation" && item.character === "周放"
  ))
  assert.ok(result.issues.some((item) =>
    item.code === "missing-arc" && item.character === "陈默"
  ))
})

test("CQ6 红线命中和平线节奏会提示，但不输出伪评分", () => {
  const result = auditCreativeQuality({
    brief: { redline: "不要打脸，不要巧合破案" },
    characters,
    episodes: episodes().map((episode, index) => ({
      ...episode,
      hook: `${episode.hook} 最终靠巧合破案。`,
      intensity: index === 2 ? 4 : 3,
    })),
  })

  assert.ok(result.issues.some((item) => item.code === "redline-hit"))
  assert.ok(result.issues.some((item) => item.code === "flat-pacing"))
  assert.equal("score" in result, false)
})

test("CQ7 工作台提供创作体检入口，并与 Agent 使用同一审计结果", () => {
  const workMeta = fs.readFileSync("components/WorkMeta.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const panel = fs.readFileSync("components/CreativeAuditPanel.tsx", "utf8")
  const agent = fs.readFileSync("lib/agent/tools.ts", "utf8")

  assert.match(workMeta, /创作体检/)
  assert.match(page, /auditCreativeQuality/)
  assert.match(page, /CreativeAuditPanel/)
  assert.ok(page.indexOf("<CreativeAuditPanel") < page.indexOf("<EntityCommentsPanel"))
  assert.match(panel, /没有发现确定性问题/)
  assert.match(agent, /auditCreativeQuality/)
})

test("CQ8 超出面板展示上限时仍返回完整总数", () => {
  const result = auditCreativeQuality({
    characters: Array.from({ length: 18 }, (_, index) => ({
      name: `角色${index + 1}`,
      motivation: "",
      arc: "",
    })),
    episodes: [],
  })

  assert.ok(result.issues.length > 30)
  assert.equal(result.counts.total, result.issues.length)
  assert.equal(result.counts.error, 18)
  assert.equal(result.counts.warning, 18)
})
