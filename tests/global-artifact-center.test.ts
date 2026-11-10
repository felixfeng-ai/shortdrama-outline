import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  ARTIFACT_KIND_META,
  countArtifactItems,
  describeAgentCard,
  diffArtifactPayloads,
  summarizeArtifactSnapshots,
} from "../lib/artifact-center.ts"

test("GA1 项目条提供带种类计数的产物入口", () => {
  const projectBar = fs.readFileSync("components/ProjectBar.tsx", "utf8")

  assert.match(projectBar, /onOpenArtifacts/)
  assert.match(projectBar, /artifactKindCount/)
  assert.match(projectBar, /产物/)
  assert.match(projectBar, /disabled=\{!artifactKindCount && !onOpenArtifacts\}/)
})

test("GA2 产物目录覆盖八类创作产物", () => {
  assert.deepEqual(
    ARTIFACT_KIND_META.map((item) => item.label),
    ["故事", "人物", "三幕", "分集", "定妆", "场次", "地点", "分镜"],
  )
})

test("GA2 最新版本摘要只使用真实快照值", () => {
  const snapshots = [
    {
      id: "old",
      kind: "characters",
      version: 1,
      payload: [{ id: "c1", name: "陈默" }],
      parents: [],
      createdAt: 100,
    },
    {
      id: "new",
      kind: "characters",
      version: 2,
      payload: [
        { id: "c1", name: "陈默" },
        { id: "c2", name: "林岚" },
      ],
      parents: [],
      createdAt: 200,
    },
  ]

  const summary = summarizeArtifactSnapshots(snapshots)
  assert.equal(summary.latest?.id, "new")
  assert.equal(summary.version, 2)
  assert.equal(summary.itemCount, 2)
  assert.equal(summary.updatedAt, 200)
  assert.deepEqual(summary.history.map((item) => item.version), [2, 1])
})

test("GA2 条目数把空想法算作零，并支持对象清单", () => {
  assert.equal(countArtifactItems({ idea: "", genre: "none" }), 0)
  assert.equal(countArtifactItems({ idea: "一个雨夜追债故事", genre: "suspense" }), 1)
  assert.equal(countArtifactItems([{ id: "a" }, { id: "b" }]), 2)
  assert.equal(countArtifactItems({ items: [{ id: "a" }] }), 1)
  assert.equal(countArtifactItems(null), 0)
})

test("GA2 差异来自真实结构变化，不生成伪评分", () => {
  const changes = diffArtifactPayloads(
    [
      { id: "s1", summary: "旧场次", characters: ["陈默"] },
      { id: "s2", summary: "会被删除" },
    ],
    [
      { id: "s1", summary: "新场次", characters: ["陈默", "林岚"] },
      { id: "s3", summary: "新增场次" },
    ],
  )

  assert.ok(changes.some((item) => item.path.includes("summary") && item.after === "新场次"))
  assert.ok(changes.some((item) => item.kind === "added"))
  assert.ok(changes.some((item) => item.kind === "removed"))
  assert.ok(changes.every((item) => !("score" in item)))
  assert.deepEqual(diffArtifactPayloads([{ id: "same" }], [{ id: "same" }]), [])
})

test("GA3 Agent 待确认卡有统一类型、目标与摘要", () => {
  const description = describeAgentCard({
    kind: "shot-edit",
    targetId: "shot-1",
    shot: 3,
    episode: 1,
    targetLabel: "第 1 集 · 镜 3",
    target: "action",
    expectedText: "旧动作",
    text: "新动作",
    summary: "加强冲突",
  })

  assert.equal(description.type, "镜头改写")
  assert.equal(description.target, "第 1 集 · 镜 3")
  assert.equal(description.summary, "加强冲突")
  assert.match(description.nextAction, /Agent/)
})

test("GA3 所有 Agent 卡片类型都能进入统一确认队列", () => {
  const cards = [
    {
      kind: "entity-edit",
      targetType: "character",
      targetId: "c1",
      targetName: "陈默",
      field: "motivation",
      expectedText: "旧动机",
      text: "新动机",
      summary: "加强动机",
    },
    {
      kind: "localization-edit",
      branchId: "b1",
      targetType: "character",
      targetId: "c1",
      targetName: "陈默",
      text: "Chen Mo",
      summary: "统一英文名",
    },
    {
      kind: "decision",
      step: "episodes",
      stepLabel: "分集",
      question: "钩子选哪个方向？",
      options: ["A", "B"],
      recommended: "B",
      reason: "冲突更强",
    },
    {
      kind: "video-plan",
      shotIds: ["s1"],
      shotCount: 1,
      durationSeconds: 10,
      model: "model-a",
      resolution: "720P",
      estimatedCostMicros: 100,
      budgetLimitMicros: 200,
    },
    {
      kind: "video-rework",
      episode: 1,
      shotIds: ["s1"],
      items: [{ shotId: "s1", targetLabel: "镜 1", reasons: ["抖动"] }],
      reason: "画质",
      summary: "1 镜需返修",
    },
    {
      kind: "timeline-plan",
      episode: 1,
      operations: [{ op: "replace", shotId: "s1" }],
      summary: "替换 1 个镜头",
    },
    {
      kind: "voice-plan",
      bindings: [{ characterName: "陈默", voiceId: "v1", label: "沉稳男声" }],
      summary: "绑定 1 个角色",
    },
    {
      kind: "tts-plan",
      episode: 1,
      shotIds: ["s1"],
      lineCount: 2,
      characters: 1,
      estimatedCostMicros: 100,
      maxBudgetMicros: 200,
      unboundLines: 0,
      summary: "2 句台词",
    },
    {
      kind: "render-plan",
      episode: 1,
      versionId: "v1",
      revision: 1,
      readyCount: 1,
      totalShots: 1,
      blockedCount: 0,
      issueCount: 0,
      totalDurationMs: 10_000,
      summary: "可渲染",
    },
    {
      kind: "regenerate",
      step: "characters",
      stepLabel: "",
      reason: "需要重跑",
    },
  ] as const

  const descriptions = cards.map((card) => describeAgentCard(card as any))
  assert.deepEqual(
    descriptions.map((item) => item.type),
    ["实体修改", "海外本地化", "创作决策", "视频预算", "视频返修", "时间线提案", "音色建议", "TTS 批量", "成片提案", "重新生成"],
  )
  assert.equal(descriptions.at(-1)?.target, "当前步骤")
  assert.ok(descriptions.every((item) => item.nextAction.includes("Agent")))
})

test("GA2 无稳定 id 的数组按位置比较，并遵守差异上限", () => {
  const changes = diffArtifactPayloads(["旧值"], ["新值", "新增值"], 2)
  assert.equal(changes.length, 2)
  assert.equal(changes[0].kind, "changed")
  assert.equal(changes[1].kind, "added")

  const duplicateIds = diffArtifactPayloads(
    [{ id: "same", value: 1 }, { id: "same", value: 2 }],
    [{ id: "same", value: 1 }, { id: "same", value: 3 }],
  )
  assert.ok(duplicateIds.some((item) => item.after === "3"))
})

test("GA2 无 id 对象与不可序列化值仍可安全展示", () => {
  const before: Record<string, unknown> = { title: "旧标题" }
  before.self = before
  const changes = diffArtifactPayloads(
    { value: before },
    { value: { title: "新标题" } },
  )
  assert.ok(changes.some((item) => item.kind === "removed" && item.before === "[object Object]"))
  assert.equal(diffArtifactPayloads([{ value: 1 }], [{ value: 2 }]).length, 1)
  assert.equal(countArtifactItems({}), 0)
})

test("GA1-GA3 全局抽屉接线完整", () => {
  const component = fs.existsSync("components/ArtifactCenter.tsx")
    ? fs.readFileSync("components/ArtifactCenter.tsx", "utf8")
    : ""
  const dock = fs.readFileSync("components/AgentDock.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")

  assert.match(component, /if \(!open\) return null/)
  assert.match(component, /创作产物/)
  assert.match(component, /确认队列/)
  assert.match(component, /SmoothCollapse/)
  assert.match(component, /role="dialog"/)
  assert.match(component, /aria-modal="true"/)
  assert.match(component, /onOpenAgent/)
  assert.match(dock, /onPendingCardsChange/)
  assert.match(dock, /role === 'card'/)
  assert.match(page, /<ArtifactCenter/)
  assert.match(page, /artifactCenterOpen/)
  assert.match(page, /pendingAgentCards/)
  assert.match(page, /setArtifactCenterOpen\(false\)[\s\S]{0,180}setDeckOpen\(true\)/)
})

test("GA4 产物抽屉沿用 Signal Desk 并支持窄屏单列", () => {
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.match(css, /\.artifact-center-overlay/)
  assert.match(css, /\.artifact-center-dialog/)
  assert.match(css, /\.artifact-center-grid/)
  assert.match(css, /\.artifact-center-queue/)
  assert.match(css, /@media \(max-width: 760px\)/)
  assert.match(css, /\.artifact-center-dialog[\s\S]*min-height: 44px/)
})
