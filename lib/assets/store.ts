// 服务端的数据库单例。
//
// 为什么需要单例：Next.js 的开发模式会热重载模块，如果每次请求都新建连接，
// WAL 模式下会堆积大量文件句柄。这里缓存一个连接复用。
//
// 同时提供 __resetDbForTests 供测试注入 :memory:，避免测试之间互相污染。
import type { DatabaseSync } from "node:sqlite"
import { openDb, defaultDbPath } from "./db.ts"

let cached: DatabaseSync | null = null

/** 取当前进程复用的数据库连接 */
export function getDbForRequest(): DatabaseSync {
  if (!cached) cached = openDb(defaultDbPath())
  return cached
}

/** 仅供测试：重置连接（可传 :memory: 得到一个干净的库） */
export function __resetDbForTests(path = ":memory:"): void {
  if (cached) {
    try { cached.close() } catch { /* 已关闭则忽略 */ }
  }
  cached = openDb(path)
}
