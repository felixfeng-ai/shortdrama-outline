import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

function read(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
}

test("Web Push 客户端只在用户点击后请求权限，并注册 Service Worker", () => {
  const client = read("lib/push/client.ts")
  const button = read("components/PushNotificationButton.tsx")
  const page = read("app/page.tsx")
  assert.ok(client.includes("Notification.requestPermission"))
  assert.ok(client.includes("pushManager.subscribe"))
  assert.ok(client.includes("/api/push/subscription"))
  assert.ok(button.includes("开启完成通知"))
  assert.ok(page.includes("<PushNotificationButton"))
})

test("Service Worker 支持推送展示与点击回到对应步骤", () => {
  const sw = read("public/sw.js")
  assert.ok(sw.includes("addEventListener('push'"))
  assert.ok(sw.includes("showNotification"))
  assert.ok(sw.includes("addEventListener('notificationclick'"))
  assert.ok(sw.includes("clients.openWindow"))
  assert.ok(sw.includes("event.notification.data.url"))
})

test("关键帧生成成功或失败都会触发完成通知", () => {
  const route = read("app/api/generations/route.ts")
  assert.ok(route.includes("notifyGenerationFinished"))
  assert.match(route, /status:\s*["']succeeded["']/)
  assert.match(route, /status:\s*["']failed["']/)
})

test("浏览器推送订阅有超时兜底，不会无限停在忙碌态", () => {
  const client = read("lib/push/client.ts")
  assert.ok(client.includes("withPushTimeout"))
  assert.ok(client.includes("浏览器未能完成推送订阅"))
  assert.match(client, /15_000/)
})
