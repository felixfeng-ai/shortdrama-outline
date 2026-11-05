import type { DatabaseSync } from "node:sqlite"

import {
  claimNextVideoRender,
  recoverInterruptedVideoRenders,
} from "./render-repo.ts"
import { renderClaimedVideo } from "./render-service.ts"

let draining = false
let rerunRequested = false
const recoveredDatabases = new WeakSet<DatabaseSync>()

export async function drainVideoRenderQueue(db: DatabaseSync): Promise<void> {
  // 新进程第一次触发队列时，旧进程留下的 running 已不可能继续执行，转为可重试失败。
  if (!recoveredDatabases.has(db)) {
    recoveredDatabases.add(db)
    recoverInterruptedVideoRenders(db)
  }
  if (draining) {
    rerunRequested = true
    return
  }
  draining = true
  try {
    do {
      rerunRequested = false
      while (true) {
        const render = claimNextVideoRender(db)
        if (!render) break
        await renderClaimedVideo(db, render)
      }
    } while (rerunRequested)
  } finally {
    draining = false
  }
}

export function scheduleVideoRenderQueue(db: DatabaseSync): void {
  // 请求返回后继续跑队列；同一进程只允许一个 drain，DB 也只允许一条 running。
  void drainVideoRenderQueue(db).catch((error) => {
    console.error("[video-render] 队列执行失败", error)
  })
}
