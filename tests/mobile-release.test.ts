import assert from "node:assert/strict"
import test from "node:test"

import {
  applyMobileReleaseRecord,
  resolveMobileRelease,
} from "../lib/mobile-release.ts"

test("内测发布信息只接受 HTTPS 安装链接", () => {
  const release = resolveMobileRelease({
    CHENGJU_APP_VERSION: "1.1.0",
    CHENGJU_APP_ANDROID_URL: "https://expo.dev/artifacts/app.apk",
    CHENGJU_APP_IOS_URL: "javascript:alert(1)",
    CHENGJU_APP_RELEASED_AT: "2026-11-06",
  })

  assert.equal(release.version, "1.1.0")
  assert.equal(release.android.url, "https://expo.dev/artifacts/app.apk")
  assert.equal(release.android.direct, true)
  assert.equal(release.ios.direct, false)
  assert.match(release.ios.url, /expo\.dev\/accounts\/felix-ai\/projects\/veyaframe\/builds/)
})

test("没有配置安装直链时回到真实 EAS 构建记录", () => {
  const release = resolveMobileRelease({})
  assert.equal(release.android.direct, false)
  assert.equal(release.ios.direct, false)
  assert.match(release.android.url, /\/builds$/)
  assert.equal(release.version, "1.0.0")
})

test("运行时发布清单可覆盖版本、APK 和更新说明", () => {
  const base = resolveMobileRelease({
    CHENGJU_APP_VERSION: "1.0.0",
    CHENGJU_APP_ANDROID_URL: "https://old.example.com/app.apk",
  })
  const release = applyMobileReleaseRecord(base, {
    version: "1.2.0",
    releasedAt: "2026-11-08",
    androidUrl: "https://cdn.example.com/veyaframe-1.2.0.apk",
    iosUrl: "https://testflight.apple.com/join/demo",
    notes: ["新的 Agent 记忆", "视频审片修复"],
  })

  assert.equal(release.version, "1.2.0")
  assert.equal(release.releasedAt, "2026-11-08")
  assert.equal(release.android.url, "https://cdn.example.com/veyaframe-1.2.0.apk")
  assert.equal(release.android.direct, true)
  assert.equal(release.ios.direct, true)
  assert.deepEqual(release.notes, ["新的 Agent 记忆", "视频审片修复"])
})

test("运行时清单的非法链接和字段不会污染有效发布信息", () => {
  const base = resolveMobileRelease({
    CHENGJU_APP_VERSION: "1.1.0",
    CHENGJU_APP_ANDROID_URL: "https://example.com/stable.apk",
    CHENGJU_APP_RELEASED_AT: "2026-11-06",
  })
  const release = applyMobileReleaseRecord(base, {
    version: "bad version with spaces",
    releasedAt: "11/08/2026",
    androidUrl: "javascript:alert(1)",
    iosUrl: "http://insecure.example.com/app",
    notes: "not-an-array",
  })

  assert.equal(release.version, "1.1.0")
  assert.equal(release.releasedAt, "2026-11-06")
  assert.equal(release.android.url, "https://example.com/stable.apk")
  assert.equal(release.ios.direct, false)
  assert.ok(release.notes.length > 0)
})
