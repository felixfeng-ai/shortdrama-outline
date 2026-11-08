import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  auditProductionAcceptance,
  buildProductionAcceptanceReport,
  type AcceptanceAuditInput,
} from "../lib/production/acceptance-audit.ts"

const NOW = Date.parse("2026-11-09T12:00:00+08:00")

function readyInput() {
  const characters = [
    { name: "林晚" },
    { name: "周沉" },
    { name: "许姨" },
  ]
  const acts = [{ title: "第一幕" }, { title: "第二幕" }, { title: "第三幕" }]
  const episodes = Array.from({ length: 10 }, (_, index) => ({
    number: index + 1,
    title: `第 ${index + 1} 集`,
  }))
  const visualCharacters = characters.map((character) => ({
    name: character.name,
    anchor: `anchor:${character.name}`,
  }))
  const scenes = episodes.map((episode) => ({
    episode: episode.number,
    number: episode.number,
  }))
  const shots = episodes.map((episode) => ({
    id: `shot-${episode.number}`,
    episode: episode.number,
    shot: 1,
  }))
  const assets = shots.flatMap((shot) => [
    { targetType: "shot", targetId: shot.id, mediaKind: "image", selectedAt: NOW },
    { targetType: "shot", targetId: shot.id, mediaKind: "video", selectedAt: NOW },
  ])
  const renders = episodes.map((episode) => ({
    episode: episode.number,
    qualityProfile: "delivery",
    status: "succeeded",
  }))

  return {
    projectId: "project-acceptance",
    characters,
    acts,
    episodes,
    visualCharacters,
    scenes,
    shots,
    assets,
    tasks: [],
    renders,
    deliveryEpisodes: episodes.map((episode) => episode.number),
    expectedEpisodes: 10,
    now: NOW,
  } as unknown as AcceptanceAuditInput
}

test("ACC1 十集完整链路可判定 ready", () => {
  const report = buildProductionAcceptanceReport(readyInput())

  assert.equal(report.verdict, "ready")
  assert.equal(report.counts.episodes, 10)
  assert.equal(report.counts.imageEpisodes, 10)
  assert.equal(report.counts.videoEpisodes, 10)
  assert.equal(report.counts.deliveredEpisodes, 10)
  assert.equal(report.checks.every((check) => check.status === "pass"), true)
  assert.deepEqual(report.actions, [])
  assert.equal(report.nextAction, null)
})

test("ACC2 缺集、缺定妆或交付覆盖不足时判定 incomplete", () => {
  const input = readyInput()
  input.episodes = input.episodes.slice(0, 8)
  input.visualCharacters = input.visualCharacters.slice(0, 2)
  input.deliveryEpisodes = input.deliveryEpisodes.slice(0, 7)

  const report = buildProductionAcceptanceReport(input)

  assert.equal(report.verdict, "incomplete")
  assert.equal(report.checks.find((check) => check.id === "episodes")?.status, "missing")
  assert.equal(report.checks.find((check) => check.id === "visuals")?.status, "missing")
  assert.equal(report.checks.find((check) => check.id === "delivery")?.status, "missing")
  assert.deepEqual(
    report.actions.map((action) => action.checkId),
    ["episodes", "visuals", "delivery"],
  )
  assert.equal(report.nextAction?.workspace, "episodes")
  assert.equal(report.actions.every((action) => action.autoRunnable === false), true)
})

test("ACC3 最新任务失败或超时卡住时判定 blocked，旧失败被成功重试覆盖则不阻断", () => {
  const failed: any = readyInput()
  failed.tasks = [
    { targetType: "shot", targetId: "shot-1", mediaKind: "image", status: "failed", createdAt: NOW - 10_000 },
    { targetType: "shot", targetId: "shot-2", mediaKind: "image", status: "failed", createdAt: NOW - 20_000 },
    { targetType: "shot", targetId: "shot-2", mediaKind: "image", status: "succeeded", createdAt: NOW - 5_000 },
  ]
  const blocked = buildProductionAcceptanceReport(failed)
  assert.equal(blocked.verdict, "blocked")
  assert.equal(blocked.tasks.latestFailed, 1)
  assert.equal(blocked.nextAction?.checkId, "tasks")
  assert.equal(blocked.nextAction?.workspace, "tasks")
  assert.equal(blocked.nextAction?.costImpact, "may_charge")

  const stale: any = readyInput()
  stale.tasks = [
    { targetType: "shot", targetId: "shot-3", mediaKind: "video", status: "running", createdAt: NOW - 61 * 60 * 1000 },
  ]
  const staleReport = buildProductionAcceptanceReport(stale)
  assert.equal(staleReport.verdict, "blocked")
  assert.equal(staleReport.tasks.staleActive, 1)
  assert.equal(staleReport.nextAction?.checkId, "tasks")
})

test("ACC4 数据库审计只读且不泄露项目标题、想法或提示词", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "不能进入报告的验收标题", "owner_acceptance")
  createSnapshot(db, {
    projectId: project.id,
    kind: "characters",
    payload: [{ name: "私密角色", prompt: "不能泄露的提示词" }],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "episodes",
    payload: [{ number: 1, title: "私密分集" }],
  })

  const before = db.prepare("SELECT COUNT(*) AS n FROM snapshots").get() as { n: number }
  const report = auditProductionAcceptance(db, project.id, NOW)
  const after = db.prepare("SELECT COUNT(*) AS n FROM snapshots").get() as { n: number }
  const serialized = JSON.stringify(report)

  assert.equal(before.n, after.n)
  assert.equal(report.verdict, "incomplete")
  assert.doesNotMatch(serialized, /不能进入报告的验收标题/)
  assert.doesNotMatch(serialized, /不能泄露的提示词/)
  assert.doesNotMatch(serialized, /私密分集/)
  assert.doesNotMatch(serialized, /owner_acceptance/)
})

test("ACC5 项目验收接口按 owner 隔离并禁止缓存", () => {
  const route = fs.readFileSync("app/api/projects/[id]/acceptance/route.ts", "utf8")

  assert.match(route, /assertProjectAccess/)
  assert.match(route, /auditProductionAcceptance/)
  assert.match(route, /cache-control/)
  assert.match(route, /no-store/)
  assert.match(route, /force-dynamic/)
})
