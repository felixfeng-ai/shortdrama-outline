// 入口辅助功能：关键词联想（/api/ideas）+ 题材风格注入。
//
// 这两块是「一句话想法」入口的补强，跟六步主流程正交，
// 所以单独一个测试文件，不混进 steps / assets 的用例里。
import { test } from "node:test"
import assert from "node:assert/strict"

import { GENRES, readGenre, MAX_IDEAS_PER_ROUND } from "../lib/types.ts"
import { buildIdeaPrompt, genreClause, buildCharacterPrompt, readRecommendedGenres } from "../lib/prompts.ts"

// ── 风格校验 ────────────────────────────────────────────────────

test("G1 GENRES 第一项是不限，且 id 唯一", () => {
  assert.equal(GENRES[0].id, "none")
  assert.equal(GENRES[0].hint, "", "不限不应带 hint，否则会往 prompt 里塞空话")
  const ids = GENRES.map((g) => g.id)
  assert.equal(new Set(ids).size, ids.length, "id 不能重复")
})

test("G2 readGenre 对非法输入一律回落成 none，不抛错", () => {
  // 界面传错、老请求体没这个字段、被手动篡改——都不能让接口 500
  for (const bad of [undefined, null, "", "不存在的风格", 123, {}, []]) {
    assert.equal(readGenre(bad).id, "none", `非法值 ${JSON.stringify(bad)} 应回落成 none`)
  }
})

test("G3 readGenre 对合法 id 原样返回", () => {
  for (const g of GENRES) {
    assert.equal(readGenre(g.id).id, g.id)
  }
})

// ── 风格注入 ────────────────────────────────────────────────────

test("G4 genreClause：不限时返回空串，有风格时带上 label 与 hint", () => {
  assert.equal(genreClause(readGenre("none")), "")
  assert.equal(genreClause(undefined), "")

  const romance = readGenre("romance")
  const clause = genreClause(romance)
  assert.ok(clause.includes(romance.label), "应包含风格中文名")
  assert.ok(clause.includes(romance.hint), "应包含风格抓手，否则模型无从遵守")
})

test("G5 风格片段被注入到人物 prompt 的 system 里（否则选了等于没选）", () => {
  const none = buildCharacterPrompt("一个快递员继承了遗产", readGenre("none"))
  const work = buildCharacterPrompt("一个快递员继承了遗产", readGenre("workplace"))
  assert.equal(none.system.length < work.system.length, true, "带风格时 system 应更长")
  assert.ok(work.system.includes("职场"), "system 里应出现风格名")
})

test("G6 不传风格时行为与旧版一致（向后兼容）", () => {
  const legacy = buildCharacterPrompt("一个快递员继承了遗产")
  const explicitNone = buildCharacterPrompt("一个快递员继承了遗产", readGenre("none"))
  assert.equal(legacy.system, explicitNone.system, "省略 genre 必须等价于 none")
})

// ── 关键词联想 ──────────────────────────────────────────────────

test("I1 联想 prompt 带上关键词，并要求正好 N 个候选", () => {
  const { system, user } = buildIdeaPrompt("快递员、钥匙")
  assert.ok(user.includes("快递员"), "user 里必须有用户给的关键词")
  assert.ok(user.includes("钥匙"))
  assert.ok(system.includes(String(MAX_IDEAS_PER_ROUND)), "system 应写明候选数量")
})

test("I2 联想 prompt 用一句话想法的模板，而不是自由文本", () => {
  const { system } = buildIdeaPrompt("快递员")
  assert.ok(system.includes("ideas"), "必须是 JSON 的 ideas 数组")
  assert.ok(system.includes("title"), "每个候选要有 title")
  assert.ok(system.includes("reason"), "每个候选要有着眼点")
})

test("I3 联想时选的风格会一并注入（选职场就别联想出古装）", () => {
  const { system } = buildIdeaPrompt("快递员", readGenre("workplace"))
  assert.ok(system.includes("职场"))
})

test("I4 联想 prompt 明确要求候选走不同方向，避免三个同模板", () => {
  const { system } = buildIdeaPrompt("快递员")
  assert.ok(/不同/.test(system), "必须要求方向不同，否则三个候选会高度雷同")
})

// ── 额度隔离 ────────────────────────────────────────────────────

test("I5 ideas 是辅助步骤：计入额度，但不计入「一个完整项目」的消耗", async () => {
  const { STEP_COST, FULL_PROJECT_COST } = await import("../lib/quota.ts")
  assert.equal(STEP_COST.ideas, 1, "联想也要计额度，否则可以被白刷")
  const sixSteps = ["characters", "acts", "episodes", "visual", "scenes", "shots"]
  const sum = sixSteps.reduce((a, s) => a + STEP_COST[s], 0)
  assert.equal(FULL_PROJECT_COST, sum, "FULL_PROJECT_COST 必须只由六步构成")
  assert.equal(FULL_PROJECT_COST, 13)
})

// ── I6 题材推荐（界面上的「AI推荐」角标唯一的数据来源）──
//
// 角标必须能对上真实题材，否则它就是在撒谎。这里把口径钉住：
// 只认清单里的 id、去重、最多三个，中文名和自造 id 一律丢掉。

test("I6 readRecommendedGenres 只认清单里的合法 id", () => {
  assert.deepEqual(readRecommendedGenres({ genres: ["suspense", "costume"] }), ["suspense", "costume"])
  assert.deepEqual(readRecommendedGenres({ genres: ["悬疑"] }), [], "中文名不是 id，不能点亮标签")
  assert.deepEqual(readRecommendedGenres({ genres: ["none"] }), [], "「不限」不是推荐项")
  assert.deepEqual(readRecommendedGenres({ genres: ["made-up-id", "sweet"] }), ["sweet"])
})

test("I6b readRecommendedGenres 去重并截断到三个", () => {
  assert.deepEqual(readRecommendedGenres({ genres: ["urban", "urban", "sweet"] }), ["urban", "sweet"])
  assert.deepEqual(
    readRecommendedGenres({ genres: ["urban", "sweet", "costume", "suspense", "rebirth"] }),
    ["urban", "sweet", "costume"],
  )
})

test("I6c 缺字段、类型不对都不能崩", () => {
  assert.deepEqual(readRecommendedGenres(null), [])
  assert.deepEqual(readRecommendedGenres({}), [])
  assert.deepEqual(readRecommendedGenres({ genres: "suspense" }), [])
  assert.deepEqual(readRecommendedGenres({ genres: [1, 2, null] }), [])
})

test("I6d 提示词里要带上可挑的题材清单，模型才知道 id 从哪来", () => {
  const { system } = buildIdeaPrompt("快递员", undefined, [
    { id: "none", label: "不限", hint: "" },
    { id: "suspense", label: "悬疑", hint: "信息差驱动" },
  ])
  assert.ok(system.includes("suspense=悬疑"), "清单要给 id=中文名 的对应关系")
  assert.ok(system.includes("genres"), "JSON 模板里要有 genres 字段")
})
