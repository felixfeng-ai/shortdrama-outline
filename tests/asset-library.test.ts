import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  listReusableAssets,
  saveReusableAsset,
} from "../lib/assets/library.ts"

const owner = `anon_${"l".repeat(48)}`
const otherOwner = `anon_${"q".repeat(48)}`

const character = {
  id: "char-1",
  name: "林远",
  identity: "调查记者",
  personality: "克制、先观察再行动",
  motivation: "查明父亲失踪真相",
  arc: "从独自承担到学会求助",
}

test("AL1 跨项目保存角色文本，不保存图片或本地路径", () => {
  const db = openDb(":memory:")
  try {
    const source = createProject(db, "来源项目", owner)
    const asset = saveReusableAsset(db, owner, {
      projectId: source.id,
      assetType: "character",
      name: character.name,
      sourceAssetId: character.id,
      content: {
        ...character,
        image: "should-not-be-stored",
        vaultKey: "local/private.png",
      },
    }, 100)

    assert.equal(asset.name, "林远")
    assert.equal(asset.version, 1)
    assert.equal(asset.sourceProjectId, source.id)
    assert.equal("image" in asset.content, false)
    assert.equal("vaultKey" in asset.content, false)
    assert.equal(asset.content.personality, character.personality)
  } finally {
    db.close()
  }
})

test("AL2 同 owner 同类型同名资产更新版本，不产生重复记录", () => {
  const db = openDb(":memory:")
  try {
    const first = createProject(db, "项目一", owner)
    const second = createProject(db, "项目二", owner)
    saveReusableAsset(db, owner, {
      projectId: first.id,
      assetType: "character",
      name: "林远",
      sourceAssetId: "char-a",
      content: character,
    }, 200)
    const updated = saveReusableAsset(db, owner, {
      projectId: second.id,
      assetType: "character",
      name: "林远",
      sourceAssetId: "char-b",
      content: { ...character, personality: "更沉默，遇事先记下证据" },
    }, 300)

    assert.equal(updated.version, 2)
    assert.equal(updated.sourceProjectId, second.id)
    assert.equal(updated.content.personality, "更沉默，遇事先记下证据")
    assert.equal(listReusableAssets(db, owner, "character").length, 1)
  } finally {
    db.close()
  }
})

test("AL3 资产库按 owner 隔离，并支持地点与视觉宪法类型", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "来源项目", owner)
    saveReusableAsset(db, owner, {
      projectId: project.id,
      assetType: "place",
      name: "旧报社",
      sourceAssetId: "place-1",
      content: { name: "旧报社", space: "斑驳水泥墙与旧印刷机" },
    })
    saveReusableAsset(db, otherOwner, {
      projectId: createProject(db, "别人项目", otherOwner).id,
      assetType: "look",
      name: "冷色悬疑",
      sourceAssetId: "look-1",
      content: { tone: "冷青", lighting: "硬侧光" },
    })

    assert.deepEqual(listReusableAssets(db, owner).map((item) => item.assetType), ["place"])
    assert.deepEqual(listReusableAssets(db, otherOwner).map((item) => item.assetType), ["look"])
  } finally {
    db.close()
  }
})
