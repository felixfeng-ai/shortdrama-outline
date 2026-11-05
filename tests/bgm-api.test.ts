import { test } from "node:test"
import assert from "node:assert/strict"

import {
  DELETE as deleteBgm,
  GET as listBgm,
  POST as uploadBgm,
} from "../app/api/audio/bgm/route.ts"
import { GET as getBgmFile } from "../app/api/audio/bgm/[id]/file/route.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const OWNER = `anon_${"m".repeat(48)}`
const MP3 = Uint8Array.from([
  0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
])

function headers(json = false): Headers {
  const result = new Headers({ cookie: `chengju_sid=${OWNER}` })
  if (json) result.set("content-type", "application/json")
  return result
}

function setup() {
  __resetDbForTests(":memory:")
  return createProject(getDbForRequest(), "BGM 接口", OWNER)
}

test("P1-V5 BGM 上传、授权声明、列表、下载和删除", async () => {
  const project = setup()
  const form = new FormData()
  form.set("projectId", project.id)
  form.set("licenseConfirmed", "true")
  form.set("licenseNote", "用户原创")
  form.set("file", new File([MP3], "rain.mp3", { type: "audio/mpeg" }))
  const uploaded = await uploadBgm(new Request("http://localhost/api/audio/bgm", {
    method: "POST",
    headers: headers(),
    body: form,
  }))
  const uploadedBody = await uploaded.json()
  assert.equal(uploaded.status, 200)
  assert.equal(uploadedBody.data.track.name, "rain.mp3")
  assert.equal(uploadedBody.data.track.licenseConfirmed, true)
  assert.equal(uploadedBody.data.track.bytes, MP3.length)
  assert.match(uploadedBody.data.track.sha256, /^[0-9a-f]{64}$/)

  const list = await listBgm(new Request(
    `http://localhost/api/audio/bgm?projectId=${project.id}`,
    { headers: headers() },
  ))
  const listBody = await list.json()
  assert.equal(listBody.data.tracks.length, 1)

  const file = await getBgmFile(new Request(
    `http://localhost/api/audio/bgm/${uploadedBody.data.track.id}/file?projectId=${project.id}`,
    { headers: headers() },
  ), { params: Promise.resolve({ id: uploadedBody.data.track.id }) })
  assert.equal(file.status, 200)
  assert.equal(file.headers.get("content-type"), "audio/mpeg")
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [...MP3])

  const removed = await deleteBgm(new Request(
    `http://localhost/api/audio/bgm?projectId=${project.id}&id=${uploadedBody.data.track.id}`,
    { method: "DELETE", headers: headers() },
  ))
  assert.equal(removed.status, 200)
})

test("P1-V5 BGM 拒绝未授权和伪装音频", async () => {
  const project = setup()
  const unauthorized = new FormData()
  unauthorized.set("projectId", project.id)
  unauthorized.set("licenseConfirmed", "false")
  unauthorized.set("file", new File([MP3], "rain.mp3", { type: "audio/mpeg" }))
  const rejected = await uploadBgm(new Request("http://localhost/api/audio/bgm", {
    method: "POST",
    headers: headers(),
    body: unauthorized,
  }))
  assert.equal(rejected.status, 400)

  const fake = new FormData()
  fake.set("projectId", project.id)
  fake.set("licenseConfirmed", "true")
  fake.set("file", new File([Uint8Array.from([1, 2, 3, 4])], "fake.mp3", {
    type: "audio/mpeg",
  }))
  const invalid = await uploadBgm(new Request("http://localhost/api/audio/bgm", {
    method: "POST",
    headers: headers(),
    body: fake,
  }))
  assert.equal(invalid.status, 400)
})
