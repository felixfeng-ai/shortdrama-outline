import { test } from "node:test"
import assert from "node:assert/strict"

import { readStoreZip } from "../lib/archive/zip.ts"
import { buildStoreZipBytes } from "../lib/archive/zip-write.ts"

test("DELIVERY-ZIP1 服务端 ZIP 可被现有读取器完整还原", async () => {
  const bytes = buildStoreZipBytes([
    { name: "episode-01/metadata.json", data: new TextEncoder().encode('{"ok":true}') },
    { name: "episode-01/episode.srt", data: new TextEncoder().encode("1\n00:00:00,000 --> 00:00:01,000\n你好\n") },
  ])
  const entries = await readStoreZip(new Blob([
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  ]))
  assert.equal(new TextDecoder().decode(entries.get("episode-01/metadata.json")), '{"ok":true}')
  assert.match(new TextDecoder().decode(entries.get("episode-01/episode.srt")), /你好/)
})

