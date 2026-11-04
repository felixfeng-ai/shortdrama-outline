import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import type { Shot } from "../lib/assets/types.ts"
import type { ShotQcResult } from "../lib/assets/qc.ts"
import type { EntityComment } from "../lib/entity-comments.ts"
import type { GeneratedAsset, GenerationTask } from "../lib/generation/types.ts"
import {
  PRODUCTION_LEDGER_SCHEMA,
  buildProductionLedger,
  productionLedgerCsv,
} from "../lib/production-ledger.ts"

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "shot-row-1",
    entityId: "shot-1",
    shot: 1,
    episode: 1,
    scene: "楼道",
    characters: ["陈默"],
    action: "敲门",
    speaker: "",
    dialogue: "",
    place: "旧楼",
    shotSize: "中景",
    camera: "固定",
    prompt: "cinematic still",
    refImages: ["陈默·正面"],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: false },
    status: "done",
    ...over,
  }
}

const qc: ShotQcResult[] = [
  {
    shotId: "shot-row-1",
    entityId: "shot-1",
    episode: 1,
    shot: 1,
    needsRepair: true,
    staleReferences: ["陈默"],
    issues: [{
      code: "stale-reference",
      message: "陈默的采用图晚于本镜采用图",
      character: "陈默",
    }],
  },
  {
    shotId: "shot-row-2",
    entityId: "shot-2",
    episode: 1,
    shot: 2,
    needsRepair: false,
    staleReferences: [],
    issues: [],
  },
]

const comments: EntityComment[] = [{
  id: "comment-1",
  projectId: "project-1",
  targetType: "shot",
  targetId: "shot-1",
  targetName: "第 1 集 · 第 1 镜",
  body: "门牌要更清楚，保留雨声。",
  status: "open",
  authorId: "anon_abcdef1234567890",
  createdAt: 10,
  updatedAt: 11,
  resolvedAt: null,
}]

const tasks: GenerationTask[] = [{
  id: "task-1",
  projectId: "project-1",
  targetType: "shot",
  targetId: "shot-1",
  providerId: "aliyun",
  model: "model",
  prompt: "prompt",
  promptHash: "hash",
  status: "failed",
  error: "Provider 超时",
  assetId: null,
  createdAt: 12,
  startedAt: 13,
  finishedAt: 14,
}]

const assets: GeneratedAsset[] = [{
  id: "asset-1",
  taskId: "task-1",
  projectId: "project-1",
  targetType: "shot",
  targetId: "shot-1",
  storageKey: "generated/project-1/asset.png",
  mime: "image/png",
  bytes: 120,
  providerId: "aliyun",
  model: "model",
  prompt: "prompt",
  selectedAt: 20,
  createdAt: 15,
  downloadUrl: "/api/generated-assets/asset-1",
}]

function ledger() {
  return buildProductionLedger({
    projectTitle: "雨夜快递",
    generatedAt: 100,
    shots: [
      shot(),
      shot({
        id: "shot-row-2",
        entityId: "shot-2",
        shot: 2,
        scene: "天台",
        status: "rework",
        missingRefFor: ["苏婉"],
      }),
    ],
    qc,
    comments,
    tasks,
    assets,
  })
}

test("LEDGER1 逐镜合并状态、质检、批注、任务与采用图", () => {
  const report = ledger()
  assert.equal(report.schema, PRODUCTION_LEDGER_SCHEMA)
  assert.equal(report.rows.length, 2)
  const first = report.rows[0]
  assert.equal(first.entityId, "shot-1")
  assert.equal(first.status, "done")
  assert.equal(first.qcIssues.length, 1)
  assert.equal(first.openComments, 1)
  assert.match(first.latestComment, /门牌要更清楚/)
  assert.equal(first.latestTask?.status, "failed")
  assert.equal(first.hasSelectedAsset, true)
})

test("LEDGER2 汇总统计区分完成、返修、待出图与失败任务", () => {
  const report = ledger()
  assert.equal(report.summary.totalShots, 2)
  assert.equal(report.summary.doneShots, 1)
  assert.equal(report.summary.reworkShots, 1)
  assert.equal(report.summary.todoShots, 0)
  assert.equal(report.summary.issueShots, 1)
  assert.equal(report.summary.missingReferenceShots, 1)
  assert.equal(report.summary.openComments, 1)
  assert.equal(report.summary.failedTasks, 1)
})

test("LEDGER3 作者只展示脱敏成员标识", () => {
  const row = ledger().rows[0]
  assert.equal(row.comments[0].authorLabel, "成员 7890")
  assert.equal(JSON.stringify(row).includes("anon_abcdef1234567890"), false)
})

test("LEDGER4 CSV 有稳定表头并正确转义逗号、引号和换行", () => {
  const report = buildProductionLedger({
    projectTitle: "测试",
    generatedAt: 1,
    shots: [shot({ scene: '楼道, "雨夜"' })],
    qc: qc.slice(0, 1),
    comments: [{
      ...comments[0],
      body: '改门牌，保留"雨声"\n不要加台词',
    }],
    tasks,
    assets,
  })
  const csv = productionLedgerCsv(report)
  for (const header of ["集号", "镜号", "场景", "状态", "质检问题", "未处理批注", "最新批注", "任务状态", "采用图"]) {
    assert.ok(csv.includes(header), `缺少表头 ${header}`)
  }
  assert.match(csv, /"楼道, ""雨夜"""/)
  assert.match(csv, /改门牌，保留""雨声"" 不要加台词/)
  assert.ok(!csv.includes("\n不要加台词"))
})

test("LEDGER5 空镜头不制造行，JSON 可序列化", () => {
  const report = buildProductionLedger({
    projectTitle: "空项目",
    generatedAt: 1,
    shots: [],
    qc: [],
    comments: [],
    tasks: [],
    assets: [],
  })
  assert.equal(report.rows.length, 0)
  assert.equal(report.summary.totalShots, 0)
  assert.doesNotThrow(() => JSON.stringify(report))
})

test("LEDGER6 工作台、复制入口与项目包接线", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const meta = fs.readFileSync("components/WorkMeta.tsx", "utf8")
  const panel = fs.readFileSync("components/ProductionLedgerPanel.tsx", "utf8")
  assert.match(page, /buildProductionLedger/)
  assert.match(page, /ProductionLedgerPanel/)
  assert.match(page, /production\/ledger\.csv/)
  assert.match(page, /production\/ledger\.json/)
  assert.match(meta, /生产台账/)
  assert.match(panel, /复制台账 CSV/)
})
