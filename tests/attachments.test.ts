import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { groupAttachments } from "../lib/assets/attachments.ts"

test("挂图恢复：角色与地点分组，镜头图不进入界面挂图状态", () => {
  const groups = groupAttachments([
    { ownerType: "character", ownerId: "陈默", vaultKey: "characters/a.png" },
    { ownerType: "character", ownerId: "陈默", vaultKey: "characters/b.png" },
    { ownerType: "place", ownerId: "旧宅", vaultKey: "places/old-house.png" },
    { ownerType: "shot", ownerId: "shot-1", vaultKey: "shots/one.png" },
  ])

  assert.deepEqual(groups.characters, { 陈默: ["characters/a.png", "characters/b.png"] })
  assert.deepEqual(groups.places, { 旧宅: ["places/old-house.png"] })
})

test("挂图恢复：重复引用去重，空 owner 或空 key 被跳过", () => {
  const groups = groupAttachments([
    { ownerType: "character", ownerId: "陈默", vaultKey: "a.png" },
    { ownerType: "character", ownerId: "陈默", vaultKey: "a.png" },
    { ownerType: "character", ownerId: "  ", vaultKey: "x.png" },
    { ownerType: "place", ownerId: "旧宅", vaultKey: " " },
  ])

  assert.deepEqual(groups.characters, { 陈默: ["a.png"] })
  assert.deepEqual(groups.places, {})
})

test("切换/新建项目时角色与地点挂图都必须清空，不能串项目", () => {
  const source = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
  const start = source.indexOf("function clearWorkspace()")
  const end = source.indexOf("async function handleSwitchProject", start)
  assert.ok(start >= 0 && end > start)
  const body = source.slice(start, end)
  assert.match(body, /setAttached\(\{\}\)/)
  assert.match(body, /setPlaceAttached\(\{\}\)/)
})
