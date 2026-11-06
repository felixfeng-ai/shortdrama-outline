import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { NextRequest } from "next/server"

import { resolveRuntimeMobileRelease } from "../lib/mobile-release-store.ts"
import { GET as downloadAndroid } from "../app/app/download/android/route.ts"
import { GET as getReleaseApi } from "../app/api/mobile/release/route.ts"
import { proxy } from "../proxy.ts"

function tempReleaseFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veyaframe-release-"))
  const file = path.join(dir, "app-release.json")
  fs.writeFileSync(file, content, "utf8")
  return file
}

test("MRR1 运行时 release 文件无需重启即可覆盖 App 版本", () => {
  const file = tempReleaseFile(JSON.stringify({
    version: "2.0.0",
    releasedAt: "2026-11-10",
    androidUrl: "https://cdn.example.com/veyaframe-2.0.0.apk",
    notes: ["全新工作台", "视频生成优化"],
  }))
  const release = resolveRuntimeMobileRelease({
    CHENGJU_APP_RELEASE_FILE: file,
    CHENGJU_APP_VERSION: "1.0.0",
  })

  assert.equal(release.version, "2.0.0")
  assert.equal(release.android.url, "https://cdn.example.com/veyaframe-2.0.0.apk")
  assert.equal(release.android.direct, true)
})

test("MRR2 release 文件损坏或不存在时安全回退", () => {
  const broken = tempReleaseFile("{broken json")
  const brokenRelease = resolveRuntimeMobileRelease({
    CHENGJU_APP_RELEASE_FILE: broken,
    CHENGJU_APP_VERSION: "1.3.0",
  })
  assert.equal(brokenRelease.version, "1.3.0")

  const missingRelease = resolveRuntimeMobileRelease({
    CHENGJU_APP_RELEASE_FILE: path.join(os.tmpdir(), "missing-release-file.json"),
    CHENGJU_APP_VERSION: "1.4.0",
  })
  assert.equal(missingRelease.version, "1.4.0")
  assert.equal(missingRelease.android.direct, false)
})

test("MRR3 稳定下载地址公开 302 到最新 APK，不要求登录", async () => {
  const file = tempReleaseFile(JSON.stringify({
    version: "2.1.0",
    androidUrl: "https://cdn.example.com/veyaframe-2.1.0.apk",
  }))
  const previous = process.env.CHENGJU_APP_RELEASE_FILE
  process.env.CHENGJU_APP_RELEASE_FILE = file
  try {
    const response = await downloadAndroid(new Request("https://chenju.work/app/download/android"))
    assert.equal(response.status, 302)
    assert.equal(response.headers.get("location"), "https://cdn.example.com/veyaframe-2.1.0.apk")
    assert.match(response.headers.get("cache-control") ?? "", /no-store/)

    const middlewareResponse = proxy(new NextRequest("https://chenju.work/app/download/android"))
    assert.equal(middlewareResponse.status, 200)
    assert.equal(middlewareResponse.headers.get("location"), null)

    const apiResponse = await getReleaseApi(new Request("https://chenju.work/api/mobile/release"))
    const payload = await apiResponse.json()
    assert.equal(payload.data.release.version, "2.1.0")
    assert.equal(payload.data.stableUrl, "https://chenju.work/app/download/android")
  } finally {
    if (previous === undefined) delete process.env.CHENGJU_APP_RELEASE_FILE
    else process.env.CHENGJU_APP_RELEASE_FILE = previous
  }
})

test("MRR4 提供原子发布脚本，失败时不覆盖上一版清单", () => {
  const source = fs.readFileSync("scripts/publish-mobile-release.mjs", "utf8")
  assert.match(source, /renameSync/)
  assert.match(source, /--android-url/)
  assert.match(source, /validHttps/)
})

test("MRR5 首次部署写入引导清单，之后保留运行时热更新", () => {
  const deploy = fs.readFileSync("deploy/cicd-deploy.sh", "utf8")
  const bootstrap = JSON.parse(
    fs.readFileSync("deploy/app-release.bootstrap.json", "utf8"),
  )

  assert.match(deploy, /if \[ ! -f "\$APP_RELEASE_FILE" \]/)
  assert.match(deploy, /install -m 600 deploy\/app-release\.bootstrap\.json "\$APP_RELEASE_FILE"/)
  assert.match(deploy, /保留现有 App 发布清单/)
  assert.equal(bootstrap.version, "1.0.0")
  assert.match(bootstrap.androidUrl, /^https:\/\/.+\.apk$/)
})
