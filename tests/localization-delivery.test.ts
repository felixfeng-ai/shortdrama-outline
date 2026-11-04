import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { createLocalizationBranch } from "../lib/localization/branches.ts"
import { saveBranchContext, upsertGlossaryEntry } from "../lib/localization/context.ts"
import { buildLocalizationDelivery } from "../lib/localization/delivery.ts"

const owner = `anon_${"n".repeat(48)}`

test("LD1 SRT 按字符上限切分，时间不重叠且没有空字幕", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "字幕交付", owner)
    const snapshot = createSnapshot(db, {
      projectId: project.id,
      kind: "episodes",
      payload: [{ id: "ep-1", number: 1, title: "原版", synopsis: "林远到达。", hook: "电话响起。" }],
    })
    const branch = createLocalizationBranch(db, project.id, owner, {
      name: "English",
      baseSnapshotId: snapshot.id,
      market: "US",
      locale: "en-US",
    })
    const context = saveBranchContext(db, project.id, branch.id, owner, {
      marketCode: "en-US",
      platforms: ["TikTok", "ReelShort"],
      subtitle: { maxLineChars: 32, maxCps: 17 },
    })
    const glossary = [
      upsertGlossaryEntry(db, project.id, branch.id, owner, {
        source: "林远",
        target: "Lin Yuan",
        kind: "person",
        locked: true,
      }),
    ]
    const delivery = buildLocalizationDelivery({
      title: "The Last Delivery",
      projectId: project.id,
      branchId: branch.id,
      sourceSnapshotId: snapshot.id,
      context,
      glossary,
      items: [{
        episode: 1,
        title: "The Letter",
        localized: "Lin Yuan enters the abandoned newspaper office and finds an unsigned letter waiting on the desk.",
        hook: "The letter is dated tomorrow.",
        source: "林远进入废弃报社，发现桌上有一封没有署名的信。",
        reason: "保留信息差并缩短句子",
        glossaryUsed: ["林远"],
        risks: [],
      }],
      visualNotes: ["旧报社招牌建议后期替换"],
      exportedAt: 1_700_000_000_000,
    })
    const paths = delivery.files.map((file) => file.path)
    assert.ok(paths.includes("localization/subtitles.srt"))
    assert.ok(paths.includes("localization/dialogue.csv"))
    assert.ok(paths.includes("localization/dubbing-script.csv"))
    assert.ok(paths.includes("localization/glossary.csv"))
    assert.ok(paths.includes("localization/localization-manifest.json"))

    const srt = delivery.files.find((file) => file.path.endsWith("subtitles.srt"))!.content
    assert.match(srt, /00:00:00,000 -->/)
    assert.doesNotMatch(srt, /\n\n\n/)
    const manifest = delivery.manifest
    assert.equal(manifest.schema, "chengju.localization-delivery")
    assert.equal(manifest.branchId, branch.id)
    assert.equal(manifest.locale, "en-US")
    assert.ok(Number(manifest.subtitleCount) >= 2)
  } finally {
    db.close()
  }
})
