import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { POST as postProject } from "../app/api/projects/route.ts"
import { GET as getRefs, PATCH as patchRefs, POST as postRefs } from "../app/api/refs/route.ts"
import { __resetDbForTests } from "../lib/assets/store.ts"
import { applyKeyRelinks, planRefRelinks } from "../lib/assets/relink.ts"
import type { RefImageMeta } from "../lib/assets/types.ts"
import type { VaultFile } from "../lib/assets/vault.ts"

function json(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/refs", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function newProject(title = "P9 验收") {
  __resetDbForTests(":memory:")
  const response = await postProject(json({ title }))
  const payload = await response.json()
  return payload.data.project.id as string
}

function ref(id: string, vaultKey: string, fileHash: string): RefImageMeta {
  return {
    id,
    projectId: "project",
    vaultKey,
    label: "定妆",
    fileHash,
    mime: "image/png",
    bytes: 10,
    ownerType: "character",
    ownerId: "陈默",
    createdAt: 1,
  }
}

function file(key: string, hash: string): VaultFile {
  return { key, name: key.split("/").pop() ?? key, hash, size: 10, mime: "image/png" }
}

test("P9-A 唯一 hash 匹配生成整组重关联，多个副本不猜", () => {
  const refs = [
    ref("r1", "旧目录/陈默-定妆.png", "hash-a"),
    ref("r2", "旧目录/陈默-定妆.png", "hash-a"),
    ref("r3", "丢失/苏婉.png", "hash-b"),
  ]
  const files = [
    file("新目录/陈默-定妆.png", "hash-a"),
    file("副本一/苏婉.png", "hash-b"),
    file("副本二/苏婉.png", "hash-b"),
  ]

  const plan = planRefRelinks(
    refs,
    files,
    ["旧目录/陈默-定妆.png", "丢失/苏婉.png"],
  )

  assert.deepEqual(plan.updates.map((item) => item.id).sort(), ["r1", "r2"])
  assert.equal(plan.oldToNew["旧目录/陈默-定妆.png"], "新目录/陈默-定妆.png")
  assert.deepEqual(plan.unresolvedKeys, ["丢失/苏婉.png"])
})

test("P9-B 同 key 的引用指纹不一致时不自动恢复", () => {
  const plan = planRefRelinks(
    [
      ref("r1", "旧.png", "hash-a"),
      ref("r2", "旧.png", "hash-b"),
    ],
    [file("新.png", "hash-a")],
    ["旧.png"],
  )

  assert.equal(plan.updates.length, 0)
  assert.deepEqual(plan.unresolvedKeys, ["旧.png"])
})

test("P9-C 本地角色和地点挂接同步替换且去重", () => {
  const next = applyKeyRelinks(
    { 陈默: ["旧.png", "另一张.png"] },
    { "旧.png": "新.png" },
  )
  assert.deepEqual(next, { 陈默: ["新.png", "另一张.png"] })

  const deduped = applyKeyRelinks(
    { 陈默: ["旧.png", "新.png"] },
    { "旧.png": "新.png" },
  )
  assert.deepEqual(deduped, { 陈默: ["新.png"] })
})

test("P9-D PATCH /api/refs 只更新位置，不改变指纹和归属", async () => {
  const projectId = await newProject()
  const hash = "a".repeat(64)
  await postRefs(json({
    projectId,
    refs: [{
      vaultKey: "旧目录/陈默.png",
      label: "定妆",
      fileHash: hash,
      mime: "image/png",
      bytes: 10,
      ownerType: "character",
      ownerId: "陈默",
    }],
  }))
  const before = await (await getRefs(
    new Request(`http://localhost/api/refs?projectId=${projectId}`),
  )).json()
  const refId = before.data.refs[0].id as string

  const response = await patchRefs(json({
    projectId,
    updates: [{
      id: refId,
      vaultKey: "新目录/陈默.png",
      fileHash: hash,
      mime: "image/jpeg",
      bytes: 20,
    }],
  }, "PATCH"))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.refs[0].vaultKey, "新目录/陈默.png")
  assert.equal(payload.data.refs[0].fileHash, hash)
  assert.equal(payload.data.refs[0].ownerType, "character")
  assert.equal(payload.data.refs[0].ownerId, "陈默")
  assert.equal(payload.data.refs[0].mime, "image/jpeg")
  assert.equal(payload.data.refs[0].bytes, 20)
})

test("P9-E 指纹不一致或跨项目更新整批失败", async () => {
  const projectId = await newProject()
  const otherResponse = await postProject(json({ title: "另一个项目" }))
  const otherPayload = await otherResponse.json()
  const otherProjectId = otherPayload.data.project.id as string
  await postRefs(json({
    projectId,
    refs: [{
      vaultKey: "旧.png",
      fileHash: "hash-a",
      ownerType: "character",
      ownerId: "陈默",
    }],
  }))
  const refs = await (await getRefs(
    new Request(`http://localhost/api/refs?projectId=${projectId}`),
  )).json()
  const refId = refs.data.refs[0].id as string

  const mismatch = await patchRefs(json({
    projectId,
    updates: [{ id: refId, vaultKey: "新.png", fileHash: "wrong-hash" }],
  }, "PATCH"))
  assert.equal(mismatch.status, 400)

  const crossProject = await patchRefs(json({
    projectId: otherProjectId,
    updates: [{ id: refId, vaultKey: "新.png", fileHash: "hash-a" }],
  }, "PATCH"))
  assert.equal(crossProject.status, 400)
})

test("P9-F 工作台接入重关联 planner、PATCH API 和本地挂接同步", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const panel = fs.readFileSync("components/VaultPanel.tsx", "utf8")
  const route = fs.readFileSync("app/api/refs/route.ts", "utf8")
  const script = fs.readFileSync("scripts/verify-vault-recovery.mjs", "utf8")

  assert.match(page, /planRefRelinks/)
  assert.match(page, /relinkRefLocations/)
  assert.match(page, /applyKeyRelinks/)
  assert.match(page, /setRefMetadata/)
  assert.match(page, /serverKeys/)
  assert.match(page, /sameOwnerHash/)
  assert.match(page, /void attachImage\(registration\.ownerId, registration\.file\)/)
  assert.match(panel, /已按文件指纹恢复/)
  assert.match(route, /export async function PATCH/)
  assert.match(script, /vault-hash-relink-desktop\.png/)
  assert.match(script, /vault-hash-relink-mobile\.png/)
})
