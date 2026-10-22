import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { POST as postSample } from "../app/api/sample/route.ts"
import { GET as getSnapshots } from "../app/api/snapshots/route.ts"
import { __resetDbForTests } from "../lib/assets/store.ts"
import { ARTIFACT_KINDS } from "../lib/assets/types.ts"
import { hasAllAnchors } from "../lib/assets/anchors.ts"
import { SAMPLE_SHOTS, SAMPLE_VISUALS } from "../lib/sample.ts"

// ── S 示例项目 ──
//
// 示例是"第一次打开时唯一能证明这工具能产出东西"的东西。所以它必须：
// 六步都不空、锚点自洽（否则一载入就报"掉锚点"，示例变反例）、且不花额度。

test("S1 载入示例后六个步骤都有内容", async () => {
  __resetDbForTests(":memory:")
  const res = await postSample(new Request("http://localhost/api/sample", { method: "POST" }))
  const payload = await res.json()
  assert.equal(res.status, 200, payload?.error ?? "")
  const projectId = payload.data.project.id as string

  for (const kind of ARTIFACT_KINDS) {
    const snap = await getSnapshots(new Request(`http://localhost/api/snapshots?projectId=${projectId}&kind=${kind}`))
    const body = await snap.json()
    assert.ok(
      body.data.snapshots.length > 0,
      `${kind} 是空的——用户点「载入示例」后这一步会显示"还没做"`,
    )
    const first = body.data.snapshots[0].payload
    assert.ok(Array.isArray(first) ? first.length > 0 : !!first, `${kind} 的快照是空载荷`)
  }
})

test("S2 示例的锚点必须逐字出现在镜头提示词里（否则示例一载入就报「掉锚点」）", () => {
  for (const shot of SAMPLE_SHOTS) {
    const ok = hasAllAnchors(shot.prompt, shot.characters, SAMPLE_VISUALS)
    assert.ok(ok, `第 ${shot.shot} 镜的角色锚点没进提示词，载入示例会立刻报错`)
  }
})

test("S2b 示例里刻意留了一处「缺参考图」，用来演示返修与待办", () => {
  const missing = SAMPLE_SHOTS.filter((s) => s.missingRefFor.length > 0)
  assert.ok(missing.length > 0, "示例应当演示一次「缺参考图」，这是产品最该被看见的提醒")
  assert.ok(SAMPLE_SHOTS.some((s) => s.status === 'rework'), "示例应当演示一次「需返修」")
})

test("S3 载入示例不消耗额度（不调模型、不扣分）", () => {
  const src = fs.readFileSync("app/api/sample/route.ts", "utf8")
  assert.ok(!src.includes("chargeQuota"), "示例是本地数据，不该走额度闸门")
  assert.ok(!src.includes("chatJson") && !src.includes("chatWithTools"), "示例不该调用模型")
})
