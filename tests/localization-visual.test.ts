import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot, latestSnapshot } from "../lib/assets/repo.ts"
import { createLocalizationBranch } from "../lib/localization/branches.ts"
import { saveBranchContext } from "../lib/localization/context.ts"
import {
  analyzeVisualLocalization,
  saveLocalizedVisualShots,
} from "../lib/localization/visual.ts"

const owner = `anon_${"p".repeat(48)}`

function setup() {
  const db = openDb(":memory:")
  const project = createProject(db, "视觉本地化", owner)
  const source = createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      id: "shot-1",
      entityId: "shot-entity-1",
      shot: 1,
      episode: 1,
      scene: "旧报社",
      action: "林远推门进入。",
      prompt: "Lin Yuan enters an old Chinese newspaper office with a large 报社 sign and a ¥ price board.",
      characters: ["林远"],
      place: "旧报社",
      shotSize: "中景",
      camera: "跟随",
      dialogue: "",
      speaker: "",
      refImages: [],
      missingRefFor: [],
      params: { ratio: "9:16", duration: 10, lastFrame: false },
      status: "todo",
    }],
  })
  const branch = createLocalizationBranch(db, project.id, owner, {
    name: "English",
    baseSnapshotId: source.id,
    market: "US",
    locale: "en-US",
  })
  const context = saveBranchContext(db, project.id, branch.id, owner, {
    marketCode: "en-US",
  })
  return { db, project, source, branch, context }
}

test("LV1 检测中文招牌、货币和可读文字，并生成修正 Prompt", () => {
  const { db, source, context } = setup()
  try {
    const shots = source.payload as Array<Record<string, unknown>>
    const suggestions = analyzeVisualLocalization(shots, context)
    assert.equal(suggestions.length, 1)
    const suggestion = suggestions[0]
    assert.ok(suggestion.issues.some((issue) => issue.code === "readable-text"))
    assert.ok(suggestion.issues.some((issue) => issue.code === "currency"))
    assert.match(suggestion.suggestedPrompt, /no readable text/i)
    assert.match(suggestion.suggestedPrompt, /USD/)
  } finally {
    db.close()
  }
})

test("LV2 确认后只写海外分支分镜，原始 Prompt 不变", () => {
  const { db, project, source, branch, context } = setup()
  try {
    const original = source.payload as Array<Record<string, unknown>>
    const suggestions = analyzeVisualLocalization(original, context)
    const localized = saveLocalizedVisualShots(
      db,
      project.id,
      branch.id,
      owner,
      source.id,
      suggestions,
      100,
    )
    assert.equal(localized.branchId, branch.id)
    assert.match(
      String((latestSnapshot(db, project.id, "shots", branch.id)?.payload as Array<Record<string, unknown>>)[0].prompt),
      /no readable text/i,
    )
    assert.match(
      String((latestSnapshot(db, project.id, "shots")?.payload as Array<Record<string, unknown>>)[0].prompt),
      /报社 sign/,
    )
  } finally {
    db.close()
  }
})
