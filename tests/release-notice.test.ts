import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  LATEST_PRODUCT_RELEASE,
  PRODUCT_RELEASES,
  formatReleaseTimestamp,
} from "../lib/releases.ts"

test("产品更新由版本、发布时间和条目组成", () => {
  assert.ok(PRODUCT_RELEASES.length > 0)
  assert.equal(PRODUCT_RELEASES[0], LATEST_PRODUCT_RELEASE)
  assert.equal(new Set(PRODUCT_RELEASES.map((release) => release.version)).size, PRODUCT_RELEASES.length)
  for (let index = 1; index < PRODUCT_RELEASES.length; index += 1) {
    assert.ok(
      Date.parse(PRODUCT_RELEASES[index - 1].publishedAt)
        > Date.parse(PRODUCT_RELEASES[index].publishedAt),
      "产品公告必须按发布时间倒序排列",
    )
  }
  assert.match(LATEST_PRODUCT_RELEASE.version, /^v\d{4}\.\d{2}\.\d{2}$/)
  assert.match(LATEST_PRODUCT_RELEASE.publishedAt, /^2026-11-08T00:00:00\+08:00$/)
  assert.equal(formatReleaseTimestamp(LATEST_PRODUCT_RELEASE.publishedAt), "2026-11-08 00:00")
  assert.ok(LATEST_PRODUCT_RELEASE.highlights.length >= 2)
  assert.equal(LATEST_PRODUCT_RELEASE.title, "VeyaTV · 成剧品牌更新")
  assert.equal(LATEST_PRODUCT_RELEASE.status, "LIVE BETA")
  assert.match(LATEST_PRODUCT_RELEASE.summary, /生产平台/)
  assert.ok(LATEST_PRODUCT_RELEASE.highlights.some((item) => item.includes("Veya Agent")))
  assert.ok(LATEST_PRODUCT_RELEASE.highlights.some((item) => item.includes("chenju.work")))
})

test("公告组件展示最新版本、时间戳，并按版本保存已读状态", () => {
  const source = fs.readFileSync("components/ReleaseNotice.tsx", "utf8")

  assert.match(source, /LATEST_PRODUCT_RELEASE\.version/)
  assert.match(source, /LATEST_PRODUCT_RELEASE\.publishedAt/)
  assert.match(source, /LATEST_PRODUCT_RELEASE\.highlights/)
  assert.match(source, /<time\s+dateTime=/)
  assert.match(source, /chengju:product-release:\$\{LATEST_PRODUCT_RELEASE\.version\}/)
  assert.doesNotMatch(source, /chengju:notice:h-deck-v1/)
  assert.doesNotMatch(source, /左边写、右边看/)
})
