import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { auditShotProduction } from "../lib/assets/qc.ts"
import type { Shot, VisualCharacter, VisualPlace } from "../lib/assets/types.ts"
import type { GeneratedAsset } from "../lib/generation/types.ts"
import { buildContinuityReport } from "../lib/skills/continuity.ts"

const lin: VisualCharacter = {
  id: "visual-lin",
  entityId: "char-lin",
  name: "林远",
  age: "29岁",
  face: "长脸",
  hair: "黑色短发",
  marks: "左眉浅疤",
  wardrobe: "沙色夹克",
  props: "钥匙",
  anchor: "age: 29岁, face: 长脸, hair: 黑色短发, marks: 左眉浅疤",
  lockedTraits: ["age", "face", "hair", "marks"],
}

const su: VisualCharacter = {
  id: "visual-su",
  entityId: "char-su",
  name: "苏婉",
  age: "62岁",
  face: "窄脸",
  hair: "灰白短发",
  marks: "右眼角痣",
  wardrobe: "深灰开衫",
  props: "旧车票",
  anchor: "age: 62岁, face: 窄脸, hair: 灰白短发, marks: 右眼角痣",
  lockedTraits: ["age", "face", "hair", "marks"],
}

const place: VisualPlace = {
  id: "place-old-building",
  name: "旧楼门口",
  space: "狭窄楼道",
  props: "斑驳铁门",
  lighting: "阴天侧光",
  grade: "低饱和青灰",
  anchor: "space: 狭窄楼道, props: 斑驳铁门, lighting: 阴天侧光",
}

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "shot-row-3",
    entityId: "shot-entity-3",
    shot: 3,
    episode: 1,
    scene: "旧楼门口",
    characters: ["苏婉"],
    action: "苏婉从门缝里看见信件",
    speaker: "苏婉",
    dialogue: "你找谁？",
    place: "旧楼门口",
    shotSize: "近景",
    camera: "固定",
    prompt: "cinematic close-up",
    refImages: [],
    missingRefFor: ["苏婉"],
    params: { ratio: "9:16", duration: 7, lastFrame: false },
    status: "rework",
    ...over,
  }
}

function asset(
  targetType: GeneratedAsset["targetType"],
  targetId: string,
  createdAt: number,
  selectedAt: number | null = createdAt + 1,
): GeneratedAsset {
  return {
    id: `${targetType}-${targetId}-${createdAt}`,
    taskId: `task-${createdAt}`,
    projectId: "project-continuity",
    targetType,
    targetId,
    storageKey: `mock/${targetType}-${createdAt}.png`,
    mime: "image/png",
    bytes: 100,
    providerId: "aliyun",
    model: "mock",
    prompt: "mock",
    selectedAt,
    createdAt,
    downloadUrl: `/api/generated-assets/${targetType}-${createdAt}`,
  }
}

test("CT1 连续性报告复用 QC 并给出按集镜定位的返修队列", () => {
  const assets = [
    asset("shot", "shot-entity-3", 100),
    asset("character", "char-su", 200),
  ]
  const report = buildContinuityReport({
    projectId: "project-continuity",
    shots: [
      shot(),
      shot({
        id: "shot-row-1",
        entityId: "shot-entity-1",
        shot: 1,
        characters: ["林远"],
        place: "",
        missingRefFor: ["林远"],
        prompt: "cinematic still",
        params: { ratio: "9:16", duration: 10, lastFrame: false },
        status: "todo",
      }),
      shot({
        id: "shot-row-10",
        entityId: "shot-entity-10",
        shot: 10,
        episode: 2,
        characters: [],
        place: "",
        prompt: "empty street at dawn",
        missingRefFor: [],
        params: { ratio: "9:16", duration: 10, lastFrame: false },
        status: "done",
      }),
    ],
    visuals: [lin, su],
    places: [place],
    assets,
  })

  assert.equal(report.readOnly, true)
  assert.equal(report.writes, false)
  assert.equal(report.modelCalls, 0)
  assert.equal(report.quotaCharged, 0)
  assert.equal(report.summary.totalShots, 3)
  assert.equal(report.summary.issueShots, 2)
  assert.equal(report.summary.cleanShots, 1)
  assert.ok(report.summary.issueCount >= 6)

  const codes = new Set(report.issues.map((issue) => issue.code))
  assert.ok(codes.has("missing-anchor"))
  assert.ok(codes.has("locked-trait"))
  assert.ok(codes.has("missing-reference"))
  assert.ok(codes.has("stale-reference"))
  assert.ok(codes.has("invalid-duration"))

  assert.deepEqual(
    report.repairQueue.map((item) => `${item.episode}-${item.shot}`),
    ["1-1", "1-3"],
  )
  const first = report.repairQueue[0]
  assert.equal(first.entityId, "shot-entity-1")
  assert.equal(first.scene, "旧楼门口")
  assert.ok(first.actions.includes("补齐角色 / 地点锚点"))

  const third = report.repairQueue[1]
  assert.equal(third.actions.includes("补齐缺失参考图"), false)
  assert.ok(third.actions.includes("重选参考并重做镜头"))
  assert.ok(third.actions.includes("改为 5 秒或 10 秒"))
  assert.match(third.reasons.join(" "), /苏婉/)
  assert.match(third.reasons.join(" "), /旧楼门口/)
})

test("CT2 空项目返回成功报告，不凭空制造问题", () => {
  const report = buildContinuityReport({
    projectId: "empty-project",
    shots: [],
    visuals: [],
    places: [],
    assets: [],
  })

  assert.equal(report.summary.totalShots, 0)
  assert.equal(report.summary.issueShots, 0)
  assert.deepEqual(report.issues, [])
  assert.deepEqual(report.repairQueue, [])
})

test("CT3 报告结果与现有 QC 对同一镜头保持同源", () => {
  const input = {
    shots: [shot()],
    visuals: [su],
    places: [place],
    assets: [
      asset("shot", "shot-entity-3", 100),
      asset("character", "char-su", 200),
    ],
  }
  const qc = auditShotProduction(input)[0]
  const report = buildContinuityReport({
    projectId: "project-continuity",
    ...input,
  })

  assert.deepEqual(
    report.issues.map((issue) => issue.code).sort(),
    qc.issues.map((issue) => issue.code).sort(),
  )
  assert.equal(report.summary.issueCount, qc.issues.length)
})

test("CT4 Skill 页面选择连续性检查时优先走确定性 Runner 并展示结构化报告", () => {
  const drawer = fs.readFileSync("components/SkillAgentDrawer.tsx", "utf8")
  const card = fs.readFileSync("components/ContinuityReportCard.tsx", "utf8")
  const client = fs.readFileSync("lib/skills/client.ts", "utf8")

  assert.ok(client.includes("/api/skills/continuity/run"))
  assert.ok(client.includes("runContinuitySkill"))
  assert.ok(drawer.includes("runContinuitySkill"))
  assert.ok(drawer.includes("skill?.id === 'continuity'"))
  assert.ok(drawer.includes("ContinuityReportCard"))
  assert.ok(drawer.includes("确定性检查"))
  assert.ok(card.includes("data-readonly"))
  assert.ok(card.includes("repairQueue"))
  assert.ok(card.includes("quotaCharged"))
  assert.ok(card.includes("writes"))
})
