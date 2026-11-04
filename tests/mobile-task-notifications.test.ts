import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  advanceTaskNotices,
  clearTaskNotices,
  type TaskNoticeState,
} from "../lib/generation/notifications.ts"

function task(id: string, status: string) {
  return {
    id,
    projectId: "project-1",
    targetType: "character",
    targetId: "character-1",
    providerId: "aliyun",
    model: "wanx",
    prompt: "prompt",
    promptHash: "hash",
    status,
    error: status === "failed" ? "failed" : null,
    assetId: status === "succeeded" ? "asset-1" : null,
    createdAt: 1,
    startedAt: null,
    finishedAt: 2,
  } as never
}

function read(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
}

test("N1 首次加载已有任务只建立基线，不补发历史通知", () => {
  const result = advanceTaskNotices(null, [
    task("done", "succeeded"),
    task("failed", "failed"),
    task("running", "running"),
  ])

  assert.deepEqual(result.state.unread, [])
  assert.deepEqual(result.notices, [])
  assert.equal(result.state.statuses.done, "succeeded")
  assert.equal(result.state.statuses.running, "running")
})

test("N2 非终态变成终态时进入未读并产生一条通知", () => {
  const previous: TaskNoticeState = {
    statuses: { job: "running" },
    unread: [],
  }
  const result = advanceTaskNotices(previous, [task("job", "succeeded")])

  assert.deepEqual(result.state.unread, ["job"])
  assert.deepEqual(result.notices.map((item) => item.id), ["job"])
})

test("N3 同一终态重复读取不会重复提醒或叠加未读", () => {
  const previous: TaskNoticeState = {
    statuses: { job: "succeeded" },
    unread: ["job"],
  }
  const result = advanceTaskNotices(previous, [
    task("job", "succeeded"),
    task("new", "running"),
  ])

  assert.deepEqual(result.state.unread, ["job"])
  assert.deepEqual(result.notices, [])
  assert.equal(result.state.statuses.new, "running")
})

test("N4 新的终态任务追加未读，兼容失败与取消状态", () => {
  const previous: TaskNoticeState = {
    statuses: { old: "succeeded" },
    unread: ["old"],
  }
  const result = advanceTaskNotices(previous, [
    task("old", "succeeded"),
    task("failed", "failed"),
    task("canceled", "canceled"),
    task("queued", "queued"),
  ])

  assert.deepEqual(result.state.unread, ["old", "failed", "canceled"])
  assert.deepEqual(result.notices.map((item) => item.id), ["failed", "canceled"])
  assert.equal(result.state.statuses.queued, "queued")
})

test("N5 清除未读只清通知，不丢任务状态基线", () => {
  const cleared = clearTaskNotices({
    statuses: { job: "succeeded" },
    unread: ["job"],
  })

  assert.deepEqual(cleared.unread, [])
  assert.equal(cleared.statuses.job, "succeeded")
})

test("N6 App 任务入口和授权入口已接线", () => {
  const shell = read("components/MobileAppShell.tsx")
  const panel = read("components/GenerationTaskPanel.tsx")
  const hook = read("components/useTaskNotifications.ts")
  const control = read("components/TaskNotificationControl.tsx")

  assert.ok(shell.includes("useTaskNotifications"), "App 没有任务提醒状态")
  assert.ok(shell.includes("taskUnread"), "任务入口没有未读状态")
  assert.ok(shell.includes("mobile-app-nav-badge"), "任务入口缺少角标")
  assert.ok(shell.includes("<TaskNotificationControl"), "我的页没有通知授权入口")
  assert.ok(panel.includes("onTasksChange"), "任务中心没有向 App 暴露任务状态")
  assert.ok(hook.includes("localStorage"), "未读状态没有持久化")
  assert.ok(hook.includes("chengju:task-notices:"), "未读状态没有按项目隔离")
  assert.ok(hook.includes("showNotification"), "授权后没有调用 Service Worker 通知")
  assert.ok(control.includes("Notification.permission"), "授权状态没有读取浏览器权限")
  assert.ok(control.includes("requestPermission"), "没有显式请求通知权限")
  assert.ok(control.includes("min-h-11"), "通知按钮触控目标小于 44px")
  assert.equal(control.includes("useEffect(() => void request"), false, "不应自动请求权限")
})

test("N7 通知点击通过 Service Worker 回到任务页", () => {
  const sw = read("public/sw.js")

  assert.ok(sw.includes("notificationclick"), "Service Worker 没有通知点击处理")
  assert.ok(sw.includes("/?app=tasks"), "通知点击没有落到任务页")
  assert.ok(sw.includes("openWindow"), "没有处理无窗口时打开新页面")
  assert.ok(sw.includes("focus"), "已有窗口不会聚焦")
})
