import assert from "node:assert/strict"
import test from "node:test"

import {
  mergeGenerationReferences,
  readClientReferenceImages,
} from "../lib/generation/client-references.ts"

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01])
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])

function encoded(bytes: Uint8Array, mime: string) {
  return { base64: Buffer.from(bytes).toString("base64"), mime }
}

test("客户端参考图接受 PNG、JPEG 与 WebP 并校验真实文件头", () => {
  const parsed = readClientReferenceImages([
    encoded(PNG, "image/png"),
    encoded(JPEG, "image/jpeg"),
    encoded(WEBP, "image/webp"),
  ])
  assert.deepEqual(parsed.map((item) => item.mime), ["image/png", "image/jpeg", "image/webp"])
  assert.deepEqual(parsed[0].bytes, PNG)
})

test("客户端参考图拒绝超量、错误格式和 MIME 伪装", () => {
  assert.throws(
    () => readClientReferenceImages(Array.from({ length: 4 }, () => encoded(PNG, "image/png"))),
    /最多 3 张/,
  )
  assert.throws(
    () => readClientReferenceImages([encoded(PNG, "image/jpeg")]),
    /声明格式不一致/,
  )
  assert.throws(
    () => readClientReferenceImages([encoded(Uint8Array.from([1, 2, 3]), "image/png")]),
    /声明格式不一致/,
  )
})

test("项目参考图优先，用户参考图按同一顺序追加且总数不超过三张", () => {
  const project = [
    { bytes: PNG, mime: "image/png" },
    { bytes: JPEG, mime: "image/jpeg" },
  ]
  const client = [
    { bytes: WEBP, mime: "image/webp" },
    { bytes: PNG, mime: "image/png" },
  ]
  assert.deepEqual(
    mergeGenerationReferences(project, client).map((item) => item.mime),
    ["image/png", "image/jpeg", "image/webp"],
  )
})
