import { test } from "node:test"
import assert from "node:assert/strict"

import { AGENT_TOOL_SCHEMAS, createToolExecutors, type AgentState } from "../lib/agent/tools.ts"
import { EMPTY_BRIEF } from "../lib/brief.ts"

// ── AT 工具层 ──
//
// 这一层的纪律（见 AGENT.md）：只读的随便查，**能"写"的只有 propose**，
// 而且 propose 只返回一张待确认卡片、绝不落库。下面既验格式，也验这条纪律。

function state(over: Partial<AgentState> = {}): AgentState {
  return {
    projectTitle: "别墅夜戏",
    hasIdea: true,
    brief: EMPTY_BRIEF,
    judgments: [],
    episodes: [],
    completed: { characters: true, acts: false, episodes: false, visuals: false, scenes: false, shots: false },
    shots: [],
    expiredShots: 0,
    quota: { remaining: 38, limit: 65, projectsLeft: 2 },
    ...over,
  }
}

const shot = (over: Partial<AgentState["shots"][number]> = {}) => ({
  shot: 1, scene: "别墅门外", characters: ["陈默"], missingRefFor: [], status: "todo",
  shotSize: "中景", camera: "固定", prompt: "medium shot", speaker: "", dialogue: "",
  ...over,
})

test("AT1 每个 schema 都有描述与参数，且与执行器一一对应", () => {
  const executors = createToolExecutors(state())
  const names = AGENT_TOOL_SCHEMAS.map((s) => s.name)
  assert.equal(new Set(names).size, names.length, "schema 名字有重复")
  for (const s of AGENT_TOOL_SCHEMAS) {
    assert.ok(s.description && s.description.length > 4, `${s.name} 缺描述（模型靠它决定何时调用）`)
    assert.ok(s.parameters && typeof s.parameters === "object", `${s.name} 缺参数定义`)
    assert.ok(executors[s.name], `${s.name} 没有对应执行器`)
  }
  // 反过来：执行器里也不能有模型不知道的工具
  for (const name of Object.keys(executors)) {
    assert.ok(names.includes(name), `${name} 有执行器但没告诉模型`)
  }
})

test("AT2 项目状态：压缩成一句人话，不是原始 JSON", () => {
  const r = createToolExecutors(state()).get_project_status({})
  assert.equal(r.ok, true)
  assert.match(r.content, /别墅夜戏/)
  assert.match(r.content, /人物/)
  assert.ok(!r.content.includes("{") && !r.content.includes("}"), "不要回原始 JSON")
})

test("AT3 分镜审计：镜数、缺图（带镜号与角色）、掉锚点、返修都说到", () => {
  const r = createToolExecutors(
    state({
      shots: [
        shot({ shot: 3, missingRefFor: ["苏婉"] }),
        shot({ shot: 7, status: "rework", missingRefFor: ["苏婉"] }),
        shot({ shot: 9 }),
      ],
      expiredShots: 2,
    }),
  ).audit_shots({})
  assert.equal(r.ok, true)
  assert.match(r.content, /共 3 镜/, "镜数要说到")
  assert.match(r.content, /2 个镜头缺参考图/)
  assert.match(r.content, /第 3 镜/)
  assert.match(r.content, /苏婉/)
  assert.match(r.content, /2 个镜头的提示词缺了当前锚点/)
  assert.match(r.content, /1 个镜头标了需返修/)
})

test("AT4 额度：读不到时说实话，不崩也不编", () => {
  const withQuota = createToolExecutors(state()).get_quota({})
  assert.match(withQuota.content, /38\/65/)
  const without = createToolExecutors(state({ quota: null })).get_quota({})
  assert.equal(without.ok, false)
  assert.match(without.content, /读不到|暂时/)
})

test("AT5 文档检索：每条片段都带出处，没命中时不硬编", () => {
  const hit = createToolExecutors(state()).search_docs({ question: "怎么把产物拿到出图平台生成视频" })
  assert.equal(hit.ok, true)
  assert.match(hit.content, /出处：/)
  const miss = createToolExecutors(state()).search_docs({ question: "今天天气怎么样" })
  assert.match(miss.content, /没有找到|没找到/)
})

test("AT6 propose_shot_edit 只出卡片，绝不改任何东西", () => {
  const s = state({ shots: [shot({ shot: 2 })] })
  const before = JSON.stringify(s)
  const r = createToolExecutors(s).propose_shot_edit({ shot: 2, target: "prompt", newText: "heavy rain, CHEN MO" })
  assert.equal(r.ok, true)
  assert.equal(r.card?.kind, "shot-edit")
  assert.equal(JSON.stringify(s), before, "propose 必须无副作用")
})

test("AT6b propose_shot_edit 的镜头号必须真实存在，目标类型必须合法", () => {
  const exec = createToolExecutors(state({ shots: [shot({ shot: 1 })] }))
  assert.equal(exec.propose_shot_edit({ shot: 99, target: "prompt", newText: "x" }).ok, false)
  assert.equal(exec.propose_shot_edit({ shot: 1, target: "prompt", newText: "" }).ok, false, "空文本不该提议")
  assert.equal(exec.propose_shot_edit({ shot: 1, target: "everything", newText: "x" }).ok, false)
})

test("AT7 propose_regenerate 只出卡片；非法步骤被拒", () => {
  const exec = createToolExecutors(state())
  const r = exec.propose_regenerate({ step: "episodes", reason: "每集钩子太弱" })
  assert.equal(r.ok, true)
  assert.equal(r.card?.kind, "regenerate")
  assert.match((r.card as { reason: string }).reason, /钩子/)
  assert.equal(exec.propose_regenerate({ step: "not-a-step", reason: "x" }).ok, false)
})

test("AT8 未知工具名不抛异常，返回可读的失败", () => {
  const exec = createToolExecutors(state())
  assert.equal(exec["delete-everything"], undefined, "不该存在这种工具")
  assert.equal(exec.propose_regenerate({}).ok, false)
})

test("AT9 review_episodes 指出缺钩子、短钩子与平线节奏", () => {
  const exec = createToolExecutors(state({
    episodes: [
      { number: 1, title: "一", hook: "太短", intensity: 3 },
      { number: 2, title: "二", hook: "", intensity: 3 },
      { number: 3, title: "三", hook: "这个钩子写得足够长，已经超过二十个字符了", intensity: 3 },
    ],
  }))
  const r = exec.review_episodes({})
  assert.equal(r.ok, true)
  assert.match(r.content, /1 集没有钩子/)
  assert.match(r.content, /少于 20 字/)
  assert.match(r.content, /平线/)
})
