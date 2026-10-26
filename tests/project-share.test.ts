import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  createProjectShare,
  loadProjectShare,
  resolveProjectShare,
} from "../lib/assets/shares.ts"

const owner = `anon_${"s".repeat(48)}`

test("S1 审阅 token 只存哈希，重新生成会撤销旧链接", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const project = createProject(db, "审阅测试剧", owner)
    createSnapshot(db, {
      projectId: project.id,
      kind: "characters",
      payload: [{ name: "林远", identity: "记者" }],
    })
    const first = createProjectShare(db, project.id, owner, { now })
    const row = db.prepare("SELECT token_hash FROM project_shares WHERE id = ?").get(first.id) as { token_hash: string }
    assert.notEqual(row.token_hash, first.token)
    assert.equal(row.token_hash.length, 64)

    const second = createProjectShare(db, project.id, owner, { now: now + 1_000 })
    assert.equal(resolveProjectShare(db, first.token, now + 2_000), null)
    assert.equal(resolveProjectShare(db, second.token, now + 2_000)?.projectId, project.id)
  } finally {
    db.close()
  }
})

test("S2 公开审阅只返回六步文本，不泄露 owner 或本地文件", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const project = createProject(db, "只读项目", owner)
    createSnapshot(db, {
      projectId: project.id,
      kind: "characters",
      payload: [{ id: "c1", name: "林远", identity: "记者" }],
    })
    createSnapshot(db, {
      projectId: project.id,
      kind: "visualCharacters",
      payload: [{ id: "c1", name: "林远", anchor: "lean face, short hair" }],
    })
    createSnapshot(db, {
      projectId: project.id,
      kind: "shots",
      payload: [{
        id: "shot-1",
        shot: 1,
        episode: 1,
        scene: "夜班仓库",
        prompt: "A reporter waits by the furnace door.",
        refImages: ["林远·定妆.png"],
        characters: ["林远"],
      }],
    })
    const share = createProjectShare(db, project.id, owner, { now })
    const review = loadProjectShare(db, share.token, now + 1_000)
    assert.equal(review?.title, "只读项目")
    assert.equal(review?.characters.length, 1)
    assert.equal(review?.visuals.length, 1)
    assert.equal(review?.shots.length, 1)
    assert.doesNotMatch(JSON.stringify(review), /anon_|vaultKey|storageKey|ownerId/)
  } finally {
    db.close()
  }
})

test("S3 过期、非法 token 和他人的项目都无法创建审阅", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const project = createProject(db, "私有项目", owner)
    const share = createProjectShare(db, project.id, owner, { now, ttlDays: 1 })
    assert.equal(loadProjectShare(db, share.token, now + 2 * 86_400_000), null)
    assert.equal(loadProjectShare(db, "not-a-token", now), null)
    assert.throws(
      () => createProjectShare(db, project.id, `anon_${"x".repeat(48)}`, { now }),
      /项目不存在/,
    )
  } finally {
    db.close()
  }
})

test("审阅入口和只读页面已接入", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const bar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  const review = fs.readFileSync("components/ProjectReview.tsx", "utf8")
  assert.ok(page.includes("handleCopyReviewLink"))
  assert.ok(bar.includes("生成审阅链接"))
  assert.ok(review.includes("只读审阅"))
  assert.ok(review.includes("六步创作产物"))
})
