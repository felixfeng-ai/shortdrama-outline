import assert from "node:assert/strict"
import test from "node:test"

import { resolveMobileRelease } from "../lib/mobile-release.ts"

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
