import { test } from "node:test"
import assert from "node:assert/strict"

import {
  isAllowedPushEndpoint,
  readPushSubscription,
} from "../lib/push/subscription.ts"
import { buildGenerationNotification } from "../lib/push/notification.ts"

test("Web Push 只接受 HTTPS 和主流浏览器推送端点", () => {
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true)
  assert.equal(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true)
  assert.equal(isAllowedPushEndpoint("https://web.push.apple.com/QGabcdef"), true)
  assert.equal(isAllowedPushEndpoint("https://wns2-abc.notify.windows.com/w/?token=x"), true)
  assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"), false)
  assert.equal(isAllowedPushEndpoint("https://attacker.example.com/push"), false)
  assert.equal(isAllowedPushEndpoint("not a url"), false)
})

test("Web Push 订阅做结构校验并去除端点首尾空白", () => {
  const parsed = readPushSubscription({
    endpoint: " https://fcm.googleapis.com/fcm/send/abc ",
    keys: { p256dh: " key-1 ", auth: " secret-1 " },
  })
  assert.deepEqual(parsed, {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "key-1", auth: "secret-1" },
  })
  assert.equal(readPushSubscription(null), null)
  assert.equal(readPushSubscription({ endpoint: "https://attacker.example.com", keys: {} }), null)
  assert.equal(readPushSubscription({
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "", auth: "x" },
  }), null)
})

test("成功通知按目标跳转定妆或分镜，并且不包含提示词", () => {
  assert.deepEqual(
    buildGenerationNotification({
      taskId: "task-1",
      targetType: "character",
      status: "succeeded",
    }),
    {
      title: "定妆图已生成",
      body: "打开成剧查看最新关键帧并决定是否采用。",
      url: "/?step=visuals",
      tag: "generation-task-1",
    },
  )
  assert.deepEqual(
    buildGenerationNotification({
      taskId: "task-2",
      targetType: "shot",
      status: "succeeded",
    }),
    {
      title: "镜头首帧已生成",
      body: "打开成剧查看最新关键帧并决定是否采用。",
      url: "/?step=shots",
      tag: "generation-task-2",
    },
  )
})

test("失败通知脱敏 Key 和文件路径；取消生成不通知", () => {
  const failed = buildGenerationNotification({
    taskId: "task-3",
    targetType: "character",
    status: "failed",
    error: "Invalid API-key sk-secret /data/generated/private.png",
  })
  assert.ok(failed)
  assert.equal(failed.title, "定妆图生成失败")
  assert.match(failed.body, /平台图像服务异常/)
  assert.doesNotMatch(failed.body, /sk-secret|Invalid API-key|data\/generated/)
  assert.equal(buildGenerationNotification({
    taskId: "task-4",
    targetType: "shot",
    status: "canceled",
  }), null)
  assert.equal(buildGenerationNotification({
    taskId: "task-5",
    targetType: "shot",
    status: "running",
  }), null)
})
