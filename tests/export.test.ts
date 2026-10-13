import { test } from "node:test"
import assert from "node:assert/strict"

import { shotsToCsv, buildStoryboardHtml, buildZip } from "../lib/assets/export.ts"
import type { Shot, VisualCharacter, Scene } from "../lib/assets/types.ts"

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "s1", entityId: "e1", shot: 1, scene: "咖啡馆", characters: ["张三"],
    action: "推门", camera: "中景", prompt: "a man, wearing: 沙色短夹克",
    refImages: ["张三·定妆正面"], missingRefFor: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo", ...over,
  }
}

// ── E1：离线自包含 ──────────────────────────────────────────────

test("E1b storyboard.html 离线可看：不含任何外部资源引用", () => {
  const html = buildStoryboardHtml({
    title: "测试剧",
    visuals: [{ id: "v", name: "张三", age: "", face: "", hair: "", marks: "", wardrobe: "", props: "", anchor: "wearing: 沙色短夹克" }],
    scenes: [{ id: "sc", number: 1, episode: 1, location: "咖啡馆", timeOfDay: "黄昏", summary: "相遇", characters: ["张三"] }],
    shots: [shot()],
  })

  assert.ok(html.startsWith("<!DOCTYPE html>"))
  assert.ok(html.includes("分镜表"))
  // 断言「无外链依赖」——这正是 E1 的可测试点
  assert.ok(!/src=["']https?:/.test(html), "不应有外部脚本/图片")
  assert.ok(!/<link[^>]+href=["']https?:/.test(html), "不应有外部样式表")
  assert.ok(html.includes("沙色短夹克"))
})

test("E1c storyboard.html 转义剧情文本，防止破坏页面结构", () => {
  const html = buildStoryboardHtml({
    title: '<script>alert(1)</script>',
    visuals: [], scenes: [], shots: [shot({ action: 'a <b> "quote"' })],
  })
  assert.ok(!html.includes("<script>alert(1)</script>"))
  assert.ok(html.includes("&lt;script&gt;"))
})

test("E1d 缺参考图的镜头在 HTML 里被显式标注，不静默", () => {
  const html = buildStoryboardHtml({
    title: "t", visuals: [], scenes: [],
    shots: [shot({ refImages: [], missingRefFor: ["李四"] })],
  })
  assert.ok(html.includes("缺参考图"))
})

// ── E3：CSV ────────────────────────────────────────────────────

test("E3c CSV 含画面比例列（这是要喂给出图工具的关键参数）", () => {
  const csv = shotsToCsv([shot()])
  assert.ok(csv.includes("画面比例"))
  assert.ok(csv.includes("9:16"))
})

test("E3d CSV 对引号做转义", () => {
  const csv = shotsToCsv([shot({ prompt: 'a man saying "hi"' })])
  assert.ok(csv.includes('""hi""'))
})

// ── ZIP 打包 ───────────────────────────────────────────────────

test("E1e buildZip 产出合法 ZIP：签名正确、含中心目录", async () => {
  const enc = new TextEncoder()
  const blob = buildZip([
    { name: "project.json", data: enc.encode('{"a":1}') },
    { name: "prompts.csv", data: enc.encode("镜号\n1\n") },
  ])
  const buf = new Uint8Array(await blob.arrayBuffer())

  // 本地文件头签名 PK\x03\x04
  assert.deepEqual(Array.from(buf.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04])
  // 文件末尾应有中心目录结束记录 PK\x05\x06
  const end = Array.from(buf.slice(-22, -18))
  assert.deepEqual(end, [0x50, 0x4b, 0x05, 0x06])
  assert.ok(blob.size > 0)
})

test("E1f buildZip 的中央目录记录了正确的文件数", async () => {
  const enc = new TextEncoder()
  const blob = buildZip([
    { name: "a.txt", data: enc.encode("aaa") },
    { name: "b.txt", data: enc.encode("bbb") },
    { name: "c.txt", data: enc.encode("ccc") },
  ])
  const buf = new Uint8Array(await blob.arrayBuffer())
  const ev = new DataView(buf.buffer, buf.byteOffset)
  // 中心目录结束记录位于末尾 22 字节
  assert.equal(ev.getUint16(buf.length - 22 + 8, true), 3)
  assert.equal(ev.getUint16(buf.length - 22 + 10, true), 3)
})

test("E1g buildZip 对中文文件名使用 UTF-8 标志位", async () => {
  const enc = new TextEncoder()
  const blob = buildZip([{ name: "角色/张三.png", data: enc.encode("x") }])
  const buf = new Uint8Array(await blob.arrayBuffer())
  const ev = new DataView(buf.buffer, buf.byteOffset)
  // 本地文件头偏移 6 处的通用标志位应含 0x0800（UTF-8）
  assert.equal((ev.getUint16(6, true) & 0x0800) !== 0, true)
})
