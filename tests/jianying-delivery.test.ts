import { test } from "node:test"
import assert from "node:assert/strict"

import { buildPlatformExportKit, PLATFORM_EXPORT_TARGETS } from "../lib/export/platforms.ts"
import type { Shot } from "../lib/assets/types.ts"

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "shot-row-1",
    entityId: "shot-entity-1",
    shot: 1,
    episode: 1,
    scene: "旧报社",
    characters: ["林远"],
    action: "林远推门进入。",
    speaker: "林远",
    dialogue: "这里十年前就封了。",
    place: "旧报社",
    shotSize: "中景",
    camera: "跟随",
    prompt: "Lin Yuan enters the abandoned newspaper office, cold light.",
    refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: true },
    status: "todo",
    ...over,
  }
}

test("JY1 剪映成为正式交付目标，并生成执行清单、字幕表和 manifest", () => {
  assert.ok(PLATFORM_EXPORT_TARGETS.includes("jianying"))
  const kit = buildPlatformExportKit({
    title: "旧报社",
    target: "jianying",
    shots: [
      shot(),
      shot({
        id: "shot-row-2",
        entityId: "shot-entity-2",
        shot: 2,
        scene: "街口",
        speaker: "",
        dialogue: "",
        params: { ratio: "9:16", duration: 5, lastFrame: false },
      }),
    ],
    keyframePathByTargetId: {
      "shot-entity-1": "assets/keyframes/shot-1.png",
    },
    exportedAt: 1_700_000_000_000,
  })

  const paths = kit.files.map((file) => file.path)
  assert.ok(paths.includes("production/jianying/shot-order.csv"))
  assert.ok(paths.includes("production/jianying/dialogue.csv"))
  assert.ok(paths.includes("production/jianying/jianying-manifest.json"))
  assert.ok(paths.includes("production/jianying/README.txt"))

  const order = kit.files.find((file) => file.path.endsWith("shot-order.csv"))!.content
  assert.match(order, /旧报社/)
  assert.match(order, /assets\/keyframes\/shot-1\.png/)
  assert.match(order, /shot-entity-2/)

  const dialogue = kit.files.find((file) => file.path.endsWith("dialogue.csv"))!.content
  assert.match(dialogue, /这里十年前就封了/)
  assert.doesNotMatch(dialogue, /shot-entity-2/, "空台词镜头不能产生伪造字幕")

  const manifest = JSON.parse(
    kit.files.find((file) => file.path.endsWith("jianying-manifest.json"))!.content,
  )
  assert.equal(manifest.schema, "chengju.jianying-delivery")
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.shotCount, 2)
  assert.equal(manifest.dialogueCount, 1)
  assert.equal(manifest.shots[0].selectedKeyframe, "assets/keyframes/shot-1.png")
})

test("JY2 导出菜单使用统一平台目标，所以自动出现剪映选项", () => {
  const targetLabel = buildPlatformExportKit({
    title: "菜单测试",
    target: "jianying",
    shots: [shot()],
  }).target
  assert.equal(targetLabel, "jianying")
})
