import { test } from "node:test"
import assert from "node:assert/strict"

import {
  GET as getAssets,
  POST as postAsset,
} from "../app/api/asset-library/route.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const owner = `anon_${"v".repeat(48)}`

function request(pathname: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (!headers.has("cookie")) headers.set("cookie", `chengju_sid=${owner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

test("ALA1 API 保存并从资产库读取角色", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "资产来源", owner)
  const response = await postAsset(request("/api/asset-library", {
    method: "POST",
    body: JSON.stringify({
      projectId: project.id,
      assetType: "character",
      name: "林远",
      sourceAssetId: "char-1",
      content: {
        name: "林远",
        personality: "克制",
        vaultKey: "private/local.png",
      },
    }),
  }))
  assert.equal(response.status, 200)
  const asset = (await response.json()).data.asset
  assert.equal(asset.content.personality, "克制")
  assert.equal("vaultKey" in asset.content, false)

  const listed = await getAssets(request("/api/asset-library?assetType=character"))
  assert.equal(listed.status, 200)
  assert.equal((await listed.json()).data.assets.length, 1)
})

test("ALA2 非来源项目 owner 不能保存资产", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "别人的项目", owner)
  const response = await postAsset(request("/api/asset-library", {
    method: "POST",
    headers: { cookie: `chengju_sid=anon_${"x".repeat(48)}` },
    body: JSON.stringify({
      projectId: project.id,
      assetType: "character",
      name: "越权角色",
      content: { name: "越权角色" },
    }),
  }))
  assert.equal(response.status, 400)
})
