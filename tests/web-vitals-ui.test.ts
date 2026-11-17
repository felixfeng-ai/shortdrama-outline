import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("根布局挂载 Web Vitals 采样器并传入发布版本", () => {
  const layout = fs.readFileSync("app/layout.tsx", "utf8")
  const reporter = fs.readFileSync("components/web-vitals-reporter.tsx", "utf8")

  assert.match(layout, /WebVitalsReporter/)
  assert.match(layout, /release=\{/)
  assert.match(reporter, /first-contentful-paint/)
  assert.match(reporter, /largest-contentful-paint/)
  assert.match(reporter, /layout-shift/)
  assert.match(reporter, /event/)
  assert.match(reporter, /sendBeacon/)
  assert.match(reporter, /\/api\/vitals/)
  // 连接类型允许通过类型守卫读取，测试只约束采集字段，不绑定某一处源码写法。
  assert.match(reporter, /effectiveType/)
  assert.doesNotMatch(reporter, /document\.body\.innerText/)
})
