import { test } from "node:test"
import assert from "node:assert/strict"

import { getPreviewUrl, vaultFileExists } from "../lib/assets/vault.ts"

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
