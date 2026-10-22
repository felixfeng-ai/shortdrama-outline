import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { GET as snapshotsGet } from "../app/api/snapshots/route.ts"
import { getDbForRequest, __resetDbForTests } from "../lib/assets/store.ts"
import { createProject } from "../lib/assets/repo.ts"
import { ARTIFACT_KINDS } from "../lib/assets/types.ts"

// ── K1 每一个快照类型都必须能被接口读出来（这条是回归测试）──
//
// 真实事故：新增 `visualPlaces` 时，只有 repo 的类型和导出清单跟上了，
// `/api/snapshots` 的白名单还停在旧清单上——那一个 kind 返回 400，
// 前端的恢复逻辑用 Promise.all 一次性取八类，整体 reject 又被 catch 吞掉，
// 于是**「刷新可续」对所有项目静默失效**：用户看不到任何报错，只是每次打开都空。
// 所以这条测试不看类型，改成逐个 kind 真打一次接口。

test("K1 ARTIFACT_KINDS 里每一个 kind 都能通过快照接口读到", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "kind 测试")
  for (const kind of ARTIFACT_KINDS) {
    const res = await snapshotsGet(new Request(`http://localhost/api/snapshots?projectId=${project.id}&kind=${kind}`))
    const payload = await res.json()
    assert.equal(res.status, 200, `${kind} 被接口拒了（${res.status} ${payload?.error ?? ''}）`)
    assert.equal(payload.success, true, `${kind} 返回的不是成功信封`)
    assert.ok(Array.isArray(payload.data.snapshots), `${kind} 没有返回数组`)
  }
})

test("K1b 非法 kind 仍然要被拒（白名单没有因为收拢而失效）", async () => {
  __resetDbForTests(":memory:")
  const res = await snapshotsGet(new Request("http://localhost/api/snapshots?projectId=p1&kind=not-a-kind"))
  assert.equal(res.status, 400)
})

test("K2 清单只有一份：两个路由与恢复逻辑都用 ARTIFACT_KINDS", () => {
  const snapshots = fs.readFileSync("app/api/snapshots/route.ts", "utf8")
  const ex = fs.readFileSync("app/api/export/route.ts", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")

  for (const [name, src] of [["/api/snapshots", snapshots], ["/api/export", ex]] as const) {
    assert.ok(src.includes("ARTIFACT_KINDS"), `${name} 没有引用唯一来源`)
    assert.ok(!/const KINDS: ArtifactKind\[\] = \[/.test(src), `${name} 里又手写了一份清单`)
  }
  assert.ok(page.includes("ARTIFACT_KINDS.map"), "恢复逻辑没有按清单逐个取（漏一个就会整体失败）")
})

test("K3 清单本身没有重复，且覆盖恢复所需的全部类型", () => {
  assert.equal(new Set(ARTIFACT_KINDS).size, ARTIFACT_KINDS.length, "清单里有重复项")
  for (const kind of ["idea", "characters", "acts", "episodes", "visualCharacters", "scenes", "visualPlaces", "shots"]) {
    assert.ok((ARTIFACT_KINDS as readonly string[]).includes(kind), `清单缺了 ${kind}`)
  }
})
