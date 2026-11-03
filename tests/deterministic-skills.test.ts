import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { POST as runSkill } from "../app/api/skills/deterministic/run/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  SAMPLE_PLACES,
  SAMPLE_SHOTS,
  SAMPLE_VISUALS,
} from "../lib/sample.ts"
import {
  buildCostSkillReport,
  buildDeliverySkillReport,
} from "../lib/skills/deterministic.ts"

const OWNER_A = `anon_${"r".repeat(48)}`
const OWNER_B = `anon_${"s".repeat(48)}`

function request(projectId: string, owner = OWNER_A, skill = "delivery"): Request {
  return new Request("http://localhost/api/skills/deterministic/run", {
    method: "POST",
    headers: new Headers({
      cookie: `chengju_sid=${owner}`,
      "content-type": "application/json",
    }),
    body: JSON.stringify({ projectId, skill }),
  })
}

test("RUN1 交付预检为确定性报告，定位阻断项与提醒项", () => {
  const report = buildDeliverySkillReport({
    projectTitle: "示例项目",
    shots: SAMPLE_SHOTS,
    visuals: SAMPLE_VISUALS,
    places: SAMPLE_PLACES,
  })

  assert.equal(report.skill, "delivery")
  assert.equal(report.modelCalls, 0)
  assert.equal(report.quotaCharged, 0)
  assert.equal(report.writes, false)
  assert.equal(report.metrics[0].value, String(SAMPLE_SHOTS.length))
  assert.ok(report.items.some((item) => item.severity === "blocking" && item.title.includes("第 2 镜")))
  assert.ok(report.items.some((item) => item.title.includes("苏婉")))
})

test("RUN2 成本规划复用纯函数预算，不生成图片也不调用模型", () => {
  const report = buildCostSkillReport({
    projectTitle: "示例项目",
    shots: SAMPLE_SHOTS,
  })

  assert.equal(report.skill, "cost")
  assert.equal(report.modelCalls, 0)
  assert.equal(report.quotaCharged, 0)
  assert.equal(report.writes, false)
  assert.ok(report.metrics.some((metric) => metric.label === "预计总成本" && metric.value.startsWith("¥")))
  assert.ok(report.items.length > 0)
})

test("RUN3 确定性 Skill API 只读项目快照，并校验项目归属", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "确定性 Skills", OWNER_A)
  createSnapshot(db, { projectId: project.id, kind: "shots", payload: SAMPLE_SHOTS })
  createSnapshot(db, { projectId: project.id, kind: "visualCharacters", payload: SAMPLE_VISUALS })
  createSnapshot(db, { projectId: project.id, kind: "visualPlaces", payload: SAMPLE_PLACES })
  const before = {
    snapshots: Number((db.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE project_id = ?").get(project.id) as { n: number }).n),
    updatedAt: Number((db.prepare("SELECT updated_at FROM projects WHERE id = ?").get(project.id) as { updated_at: number }).updated_at),
  }

  const response = await runSkill(request(project.id))
  const payload = await response.json()

  assert.equal(response.status, 200, payload?.error ?? "")
  assert.equal(payload.data.report.modelCalls, 0)
  assert.deepEqual({
    snapshots: Number((db.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE project_id = ?").get(project.id) as { n: number }).n),
    updatedAt: Number((db.prepare("SELECT updated_at FROM projects WHERE id = ?").get(project.id) as { updated_at: number }).updated_at),
  }, before)

  const forbidden = await runSkill(request(project.id, OWNER_B))
  assert.equal(forbidden.status, 403)
})

test("RUN4 Skill 页面把交付预检和成本规划接入确定性 Runner", () => {
  const drawer = fs.readFileSync("components/SkillAgentDrawer.tsx", "utf8")
  const client = fs.readFileSync("lib/skills/client.ts", "utf8")
  const card = fs.readFileSync("components/DeterministicSkillReportCard.tsx", "utf8")

  assert.ok(client.includes("/api/skills/deterministic/run"))
  assert.ok(drawer.includes("runDeterministicSkill"))
  assert.ok(drawer.includes("'delivery'"))
  assert.ok(drawer.includes("'cost'"))
  assert.ok(drawer.includes("DeterministicSkillReportCard"))
  assert.ok(card.includes("modelCalls"))
  assert.ok(card.includes("quotaCharged"))
})
