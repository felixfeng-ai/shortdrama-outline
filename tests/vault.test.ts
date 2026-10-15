import { test } from "node:test"
import assert from "node:assert/strict"

import { getPreviewUrl, vaultFileExists, visibleVaultFiles, type VaultFile } from "../lib/assets/vault.ts"
import fs from "node:fs"

// ── 图库鉴权与路径解析（不依赖浏览器，只验「读不到时不能假装读到」）──
//
// vault.ts 的索引路径依赖 indexedDB，Node 里没有这个全局对象。
// 这里注入一个最小替身，验证「取不到图时必须返回 null，而不是抛异常或返回空串」——
// 这是界面「读不到图」提示能成立的前提。

interface FakeRequest<T> { onsuccess: (() => void) | null; onerror: (() => void) | null; result: T }
function fakeIndexedDB(store: Map<string, unknown>) {
  const request = <T>(value: T): FakeRequest<T> => ({
    onsuccess: null, onerror: null, result: value,
  })
  return {
    open() {
      const req: any = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null }
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => {},
        close: () => {},
        transaction(_name: string, _mode: string) {
          const tx: any = {
            oncomplete: null, onerror: null, error: null,
            objectStore() {
              return {
                get(key: string) {
                  const r = request(store.get(key) ?? undefined)
                  queueMicrotask(() => r.onsuccess?.())
                  return r
                },
                getAllKeys() {
                  const r = request([...store.keys()])
                  queueMicrotask(() => r.onsuccess?.())
                  return r
                },
                put() { /* 测试里不需要写 */ },
              }
            },
          }
          return tx
        },
      }
      queueMicrotask(() => { req.result = db; req.onsuccess?.() })
      return req
    },
  }
}

test("F5 getPreviewUrl：图库里没有这张图时返回 null，不抛异常", async () => {
  (globalThis as any).indexedDB = fakeIndexedDB(new Map())
  const url = await getPreviewUrl("不存在的图.png")
  assert.equal(url, null)
})

test("F5b vaultFileExists：库里有的返回 true，没有的返回 false", async () => {
  (globalThis as any).indexedDB = fakeIndexedDB(
    new Map([["林远/正面.png", { size: 10, type: "image/png" }]]),
  )
  assert.equal(await vaultFileExists("林远/正面.png"), true)
  assert.equal(await vaultFileExists("苏婉/正面.png"), false)
})

test("F5c 未授权目录时（fs-access 路径不可用）依然返回 null，不挂死", async () => {
  (globalThis as any).indexedDB = fakeIndexedDB(new Map())
  const url = await getPreviewUrl("林远/正面.png")
  assert.equal(url, null)
})

// ── F6 图库的「出口」──
//
// 起因是用户反馈：误扫进来的图进了工作台却没有清除入口。
// 但清除必须分清两件事：目录直连模式下图在用户硬盘上，应用只能「不再显示」；
// 只有 IndexedDB 模式（图是应用自己存的）才可以真删。

test("F6 visibleVaultFiles 按移除名单过滤，顺序不变", () => {
  const files: VaultFile[] = [
    { key: "a.png", name: "a.png", hash: "h1", size: 1, mime: "image/png" },
    { key: "language.png", name: "language.png", hash: "h2", size: 1, mime: "image/png" },
    { key: "b.png", name: "b.png", hash: "h3", size: 1, mime: "image/png" },
  ]
  assert.deepEqual(visibleVaultFiles(files, []).map((f) => f.key), ["a.png", "language.png", "b.png"])
  assert.deepEqual(visibleVaultFiles(files, ["language.png"]).map((f) => f.key), ["a.png", "b.png"])
  // 名单里有列表里不存在的 key 也不能出错（换过文件夹、删过文件都会出现这种残留）
  assert.deepEqual(visibleVaultFiles(files, ["gone.png"]).map((f) => f.key), ["a.png", "language.png", "b.png"])
})

test("F6b 应用绝不删用户硬盘上的文件（目录直连只断开句柄）", () => {
  const src = fs.readFileSync("lib/assets/vault.ts", "utf8")
  assert.ok(!src.includes("removeEntry"), "不能调用 removeEntry：那是在删用户的素材文件")
  assert.ok(src.includes("clearDirectoryHandle"), "目录直连的出口必须是「断开句柄」")
  assert.ok(src.includes("clearIndexedVault"), "IndexedDB 模式才有真正的清空")
})
